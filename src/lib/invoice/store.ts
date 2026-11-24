import { createServiceClient } from '@/lib/supabase/service'
import { BRANDS, marqueFacturable, normalizeBrandId } from '@/lib/brand'
import { renderInvoicePdf, type AuteurPdf } from '@/lib/invoice/pdf'
import { estFrance, modeleDeLaNote, netAuteur, plafondAnnuel } from '@/lib/invoice/net-auteur'
import { estAuteur, type Employment, type Invoice, type InvoiceLine } from '@/lib/types'

export const INVOICE_BUCKET = 'invoices'

export function invoicePdfPath(invoice: Pick<Invoice, 'id' | 'provider_id'>): string {
  // Le prefixe provider_id est ce sur quoi s'appuie la policy storage.
  return `${invoice.provider_id}/${invoice.id}.pdf`
}

/** Chemin du PDF fourni par le prestataire, distinct du PDF genere. */
export function uploadedPdfPath(providerId: string, invoiceId: string): string {
  return `${providerId}/${invoiceId}-depose.pdf`
}

/**
 * Charge une facture et ses lignes SANS passer par la RLS.
 * Reserve aux traitements serveur (PDF, Pennylane) : l'appelant doit avoir
 * verifie les droits en amont.
 */
export async function loadInvoiceForRender(
  invoiceId: string
): Promise<{ invoice: Invoice; lines: InvoiceLine[] } | null> {
  const supabase = createServiceClient()

  const { data: invoice } = await supabase
    .from('inv_invoices')
    .select('*')
    .eq('id', invoiceId)
    .maybeSingle()

  if (!invoice) return null

  const { data: lines } = await supabase
    .from('inv_invoice_lines')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('sort_order')

  return { invoice: invoice as Invoice, lines: (lines ?? []) as InvoiceLine[] }
}

/**
 * Ce que la facture d'un artiste-auteur doit dire en plus : son numéro de
 * sécurité sociale, que Nolwenn reporte à l'Urssaf pour le précompte, et le
 * net à lui virer. Lus sur la fiche et les prestations au moment du rendu :
 * l'instantané de l'émetteur ne les porte pas.
 */
async function auteurDe(
  invoice: Invoice,
  lignesFacture: InvoiceLine[] = [],
  apercu?: ModeApercu,
  surcharge?: Record<string, number>
): Promise<AuteurPdf | undefined> {
  const supabase = createServiceClient()
  const { data: fiche } = await supabase
    .from('inv_providers')
    .select(
      'employment_type, social_security_number, birth_date, da_model, tax_residence_country, a1_number, a1_issuer, a1_start, a1_end'
    )
    .eq('id', invoice.provider_id)
    .maybeSingle()
  if (!estAuteur(fiche?.employment_type as Employment | undefined)) return undefined

  const { data: lignes } = await supabase
    .from('inv_missions')
    .select('id, total_ht, pay_basis')
    .eq('invoice_id', invoice.id)
  const prestations = (lignes ?? []) as { id: string; total_ht: number; pay_basis: string | null }[]
  // Montants corrigés pour un aperçu (renvoi d'une note dont le net versé
  // diffère de la base) : clé = id de la prestation.
  if (surcharge) for (const p of prestations) if (p.id in surcharge) p.total_ht = surcharge[p.id]
  // Les lignes ajoutées à la main par l'administration (régularisation,
  // correction d'un oubli) n'ont pas de prestation : elles sont en brut,
  // comme tout droit d'auteur, et entrent dans le précompte.
  for (const l of lignesFacture) {
    if (!l.mission_id) prestations.push({ id: l.id, total_ht: Number(l.total_ht), pay_basis: 'brut' })
  }
  // Aperçu « non retenu » : chaque ligne est lue comme la somme versée.
  if (apercu === 'non_retenu') for (const l of prestations) l.pay_basis = 'brut'
  // Aperçu « net versé » (option A, Nolwenn 13/11) : chaque ligne est la
  // somme virée, donc un net ; le brut est remonté et le précompte est dû par
  // Medibox.
  if (apercu === 'net_verse') for (const l of prestations) l.pay_basis = 'net'
  // Le modèle de certification de l'auteur (2, 3 ou 4), à la date de la note.
  // Un modèle 4 sans A1 valide retombe sur le 3, avec une mention visible.
  // Une fois le PDF créé, le modèle est figé sur la note (migration 54).
  const effectif = modeleDeLaNote(invoice, fiche)
  // Plafond de la vieillesse (Meghira, 20/11/2026) : par auteur et par année
  // de versement. On cumule le brut des autres notes de l'auteur dans l'année.
  const annee = Number((invoice.paid_at ?? invoice.issue_date ?? new Date().toISOString()).slice(0, 4))
  const cumulAnnee = await brutDejaVerse(invoice, annee)
  // Retenue à la source d'un non-résident (art. 182 B du CGI).
  const pays = (fiche?.tax_residence_country as string | null)?.trim() || null
  const { data: cerfa } = await supabase
    .from('inv_documents')
    .select('id')
    .eq('provider_id', invoice.provider_id)
    .eq('kind', 'residence_fiscale')
    .limit(1)
  const calcul: AuteurPdf = {
    secu: (fiche?.social_security_number as string | null)?.trim() || null,
    naissance: (fiche?.birth_date as string | null) ?? null,
    bases: Object.fromEntries(prestations.map((l) => [l.id, l.pay_basis])),
    mentionRepli: effectif.mention,
    paysResidence: (fiche?.tax_residence_country as string | null)?.trim() || null,
    a1: {
      numero: (fiche?.a1_number as string | null)?.trim() || null,
      emetteur: (fiche?.a1_issuer as string | null)?.trim() || null,
      debut: (fiche?.a1_start as string | null) ?? null,
      fin: (fiche?.a1_end as string | null) ?? null,
    },
    plafond: { montant: plafondAnnuel(annee), annee },
    retenueSource: mentionRetenueSource(pays, (cerfa ?? []).length > 0),
    ...netAuteur(prestations, effectif.modele, { cumulAnnee, annee }),
  }
  if (apercu === 'net_verse') return { ...calcul, netVerse: true }
  if (apercu !== 'non_retenu') return calcul
  return { ...calcul, net: calcul.brutTotal, precompte: [], precompteNonRetenu: true }
}

/**
 * Retenue à la source sur les droits d'auteur versés à un non-résident
 * (art. 182 B du CGI). Meghira (20/11/2026) : 0 % avec la convention
 * franco-néerlandaise, à condition d'avoir le certificat de résidence fiscale
 * (Cerfa 5000). Les autres pays n'ont pas encore de règle validée : pas de
 * mention, à voir avec le comptable.
 */
export function mentionRetenueSource(pays: string | null, cerfa5000: boolean): string | null {
  if (!pays || estFrance(pays)) return null
  if (!/^(pays[- ]bas|nl|nld|netherlands|nederland)$/i.test(pays)) return null
  return cerfa5000
    ? 'Retenue à la source (art. 182 B du CGI) : 0 %, en application de la convention fiscale entre la France et les Pays-Bas, sur présentation du certificat de résidence fiscale (Cerfa 5000).'
    : 'Retenue à la source (art. 182 B du CGI) : 0 % en application de la convention fiscale entre la France et les Pays-Bas, sous réserve de la remise du certificat de résidence fiscale (Cerfa 5000), non encore reçu.'
}

/**
 * Le brut déjà versé à l'auteur dans l'année, hors cette note : notes émises
 * (envoyées, validées, payées) dont le versement, ou à défaut la date, tombe
 * dans l'année. Le net convenu est remonté au brut au taux de son modèle.
 */
async function brutDejaVerse(invoice: Invoice, annee: number): Promise<number> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('inv_invoices')
    .select(
      'id, issue_date, paid_at, da_model, pdf_path, missions:inv_missions!inv_missions_invoice_id_fkey(total_ht, pay_basis), lignes:inv_invoice_lines(total_ht, mission_id)'
    )
    .eq('provider_id', invoice.provider_id)
    .neq('id', invoice.id)
    .in('status', ['sent', 'validated', 'paid'])
  type Row = {
    issue_date: string
    paid_at: string | null
    da_model: string | null
    pdf_path: string | null
    missions: { total_ht: number; pay_basis: string | null }[] | null
    lignes: { total_ht: number; mission_id: string | null }[] | null
  }
  const date = (invoice.paid_at ?? invoice.issue_date ?? '').slice(0, 10)
  let cumul = 0
  for (const r of (data ?? []) as unknown as Row[]) {
    const d = (r.paid_at ?? r.issue_date).slice(0, 10)
    if (Number(d.slice(0, 4)) !== annee || (date && d > date)) continue
    const lignes = [
      ...(r.missions ?? []),
      ...(r.lignes ?? []).filter((l) => !l.mission_id).map((l) => ({ total_ht: Number(l.total_ht), pay_basis: 'brut' })),
    ]
    cumul += netAuteur(lignes, modeleDeLaNote(r, null).modele).brutTotal
  }
  return Math.round(cumul * 100) / 100
}

/**
 * `non_retenu` : note payée sans précompte (avant le 13/11/2026). Brut = net
 * = somme versée, mention « non retenu à la source ».
 * `net_verse` : note payée en net (option A) : net = somme virée, brut
 * remonté selon le modèle, précompte à la charge de Medibox.
 */
export type ModeApercu = 'non_retenu' | 'net_verse'

/**
 * Rend le PDF d'une note SANS le stocker ni toucher la base, avec au besoin
 * un autre numéro. Sert à préparer un renvoi (renumérotation des notes DA du
 * 13/11/2026) pour relecture avant tout changement. Voir `ModeApercu`.
 */
export async function renderInvoicePdfApercu(
  invoiceId: string,
  numero?: string,
  apercu?: ModeApercu,
  surcharge?: Record<string, number>
): Promise<Buffer> {
  const loaded = await loadInvoiceForRender(invoiceId)
  if (!loaded) throw new Error('Facture introuvable.')
  const invoice = numero ? { ...loaded.invoice, number: numero } : loaded.invoice
  const lines = surcharge
    ? loaded.lines.map((l) =>
        l.mission_id && l.mission_id in surcharge
          ? { ...l, total_ht: surcharge[l.mission_id], unit_amount_ht: surcharge[l.mission_id] / Number(l.quantity || 1) }
          : l
      )
    : loaded.lines
  const auteur = await auteurDe(invoice, lines, apercu, surcharge)
  return renderInvoicePdf(invoice, lines, auteur)
}

/** Genere le PDF et le range dans le bucket. Renvoie le buffer. */
export async function generateAndStorePdf(invoiceId: string): Promise<Buffer> {
  const loaded = await loadInvoiceForRender(invoiceId)
  if (!loaded) throw new Error('Facture introuvable.')

  // Les mentions légales de l'émetteur sont obligatoires sur une facture.
  // Une marque dont la société n'est pas renseignée s'arrête ici : mieux
  // vaut un traitement qui échoue bruyamment qu'un PDF sans SIRET parti
  // chez le prestataire, puis chez le comptable.
  const m = normalizeBrandId(loaded.invoice.brand)
  if (!marqueFacturable(m)) {
    throw new Error(
      `Les mentions légales de ${BRANDS[m].name} ne sont pas renseignées : ` +
        'complétez la société dans src/lib/brand/config.ts avant d’émettre des factures.'
    )
  }

  const auteur = await auteurDe(loaded.invoice, loaded.lines)
  const pdf = await renderInvoicePdf(loaded.invoice, loaded.lines, auteur)
  const path = invoicePdfPath(loaded.invoice)
  const supabase = createServiceClient()

  const { error } = await supabase.storage
    .from(INVOICE_BUCKET)
    .upload(path, pdf, { contentType: 'application/pdf', upsert: true })

  if (error) throw new Error(`Stockage du PDF impossible : ${error.message}`)

  // Première création du PDF d'une note d'auteur : on y fige le modèle de
  // précompte. Une note qui avait déjà un PDF n'est pas touchée.
  const figer = auteur && !loaded.invoice.pdf_path && !loaded.invoice.da_model ? { da_model: String(auteur.modele) } : {}
  await supabase.from('inv_invoices').update({ pdf_path: path, ...figer }).eq('id', invoiceId)

  return pdf
}

/** Recupere le PDF stocke, ou le regenere s'il manque. */
export async function getInvoicePdf(invoiceId: string): Promise<Buffer> {
  const supabase = createServiceClient()
  const { data: invoice } = await supabase
    .from('inv_invoices')
    .select('id, provider_id, pdf_path, pdf_source')
    .eq('id', invoiceId)
    .maybeSingle()

  if (!invoice) throw new Error('Facture introuvable.')

  if (invoice.pdf_path) {
    const { data } = await supabase.storage
      .from(INVOICE_BUCKET)
      .download(invoice.pdf_path)
    if (data) return Buffer.from(await data.arrayBuffer())
  }

  // Une facture deposee par le prestataire ne se regenere pas : si son
  // fichier a disparu, c'est une anomalie, pas quelque chose a masquer.
  if (invoice.pdf_source === 'uploaded') {
    throw new Error(
      'La facture déposée par le prestataire est introuvable dans le stockage.'
    )
  }

  return generateAndStorePdf(invoiceId)
}
