import {
  PennylaneError,
  amount,
  createSupplier,
  getSupplier,
  getSupplierInvoice,
  isPennylaneConfigured,
  listSupplierInvoices,
  listSuppliers,
  updateSupplier,
  importSupplierInvoice,
  setSupplierInvoiceCategories,
  uploadFileAttachment,
  vatRateCode,
  type PennylaneCategoryWeight,
  type PennylaneInvoiceLine,
} from '@/lib/pennylane/client'
import { getInvoicePdf, loadInvoiceForRender } from '@/lib/invoice/store'
import { createServiceClient } from '@/lib/supabase/service'
import { ibanValide, normaliserIban } from '@/lib/iban'
import { COMPANY, type InvoiceLine } from '@/lib/types'
import { getBrandId } from '@/lib/brand'
import { estSiretMaison } from '@/lib/brand/config'

export interface SyncResult {
  ok: boolean
  pennylaneInvoiceId?: number
  error?: string
}

/**
 * Repartit la facture entre les categories Pennylane, au prorata du montant
 * de chaque ligne.
 *
 * Pennylane exige que la somme des poids d'un meme groupe fasse exactement 1.
 * Les arrondis a 7 decimales ne tombant pas juste, l'ecart residuel est
 * reporte sur la categorie la plus lourde.
 */
export function categoryWeights(lines: InvoiceLine[]): PennylaneCategoryWeight[] {
  const totals = new Map<number, number>()
  let grandTotal = 0

  for (const line of lines) {
    if (!line.pennylane_category_id) continue
    const value = Number(line.total_ht)
    totals.set(line.pennylane_category_id, (totals.get(line.pennylane_category_id) ?? 0) + value)
    grandTotal += value
  }

  if (grandTotal <= 0 || totals.size === 0) return []

  const entries = [...totals.entries()].sort((a, b) => b[1] - a[1])
  const weights = entries.map(([id, value]) => ({
    id,
    raw: Math.round((value / grandTotal) * 1e7) / 1e7,
  }))

  const drift = Math.round((1 - weights.reduce((s, w) => s + w.raw, 0)) * 1e7) / 1e7
  weights[0].raw = Math.round((weights[0].raw + drift) * 1e7) / 1e7

  return weights.map((w) => ({ id: w.id, weight: String(w.raw) }))
}

const norm = (s: string | null | undefined) =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/**
 * Trouve le fournisseur Pennylane d'un prestataire, ou le crée.
 *
 * Par SIRET d'abord — c'est la seule clé sans ambiguïté —, puis par nom. Le
 * résultat est mémorisé sur la fiche : la recherche n'a lieu qu'une fois.
 */
/**
 * L'IBAN de la fiche s'impose à la comptabilité.
 *
 * C'est lui qui dirige le virement, et c'est la personne elle-même qui l'a
 * saisi. Pennylane gardait le sien — celui d'une vieille facture, ou rien du
 * tout — et personne ne voyait l'écart avant un virement parti au mauvais
 * endroit. On le recale à chaque envoi, et seulement quand il diffère.
 */
async function alignerIban(
  supplierId: number,
  iban: string | null,
  nom: string
): Promise<void> {
  if (!ibanValide(iban)) return
  const voulu = normaliserIban(iban)
  try {
    const actuel = await getSupplier(supplierId)
    const aPennylane = (actuel.iban ?? '').replace(/\s+/g, '').toUpperCase()
    if (aPennylane === voulu) return
    await updateSupplier(supplierId, { iban: voulu })
    console.info('[pennylane] IBAN recalé pour', nom)
  } catch (err) {
    // Un IBAN qu'on n'a pas pu recaler ne doit pas bloquer la facture : on
    // le signale, et le virement se vérifiera à la main.
    console.error('[pennylane:iban]', nom, err)
  }
}

async function resolveSupplier(
  providerId: string
): Promise<{ id: number; ibanIgnore: boolean; nom: string }> {
  const supabase = createServiceClient()
  const { data: p } = await supabase
    .from('inv_providers')
    .select(
      `pennylane_supplier_id, legal_name, siret, vat_number, iban, address_line1, postal_code, city,
       contact_email, user:inv_users!inv_providers_user_id_fkey(email)`
    )
    .eq('id', providerId)
    .maybeSingle()
  if (!p) throw new PennylaneError('Prestataire introuvable.')
  if (p.pennylane_supplier_id) {
    await alignerIban(Number(p.pennylane_supplier_id), p.iban, p.legal_name)
    return {
      id: Number(p.pennylane_supplier_id),
      ibanIgnore: Boolean(p.iban) && !ibanValide(p.iban),
      nom: p.legal_name,
    }
  }

  const siret = (p.siret ?? '').replace(/\s+/g, '')
  // Un prestataire ne peut pas porter le SIRET d'une de nos sociétés : le
  // rapprochement trouverait le fournisseur qui porte ce SIREN — un autre
  // que lui, avec un autre IBAN — et la facture partirait au mauvais nom.
  if (estSiretMaison(siret)) {
    throw new PennylaneError(
      `Le SIRET renseigné sur la fiche de ${p.legal_name} est celui de la société, pas le sien. ` +
        'Corrigez-le avant d’envoyer sa facture en comptabilité.'
    )
  }
  const fournisseurs = await listSuppliers()
  const trouve =
    (/^\d{14}$/.test(siret) && fournisseurs.find((f) => f.establishment_no === siret)) ||
    (/^\d{9}/.test(siret) && fournisseurs.find((f) => f.reg_no === siret.slice(0, 9))) ||
    fournisseurs.find((f) => norm(f.name) === norm(p.legal_name))

  let id: number
  if (trouve) {
    id = trouve.id
  } else {
    const email = p.contact_email ?? (p as unknown as { user: { email: string } | null }).user?.email
    id = await createSupplier({
      name: p.legal_name,
      ...(/^\d{14}$/.test(siret) ? { establishment_no: siret, reg_no: siret.slice(0, 9) } : {}),
      ...(p.vat_number ? { vat_number: p.vat_number } : {}),
      // Un IBAN à la clé fausse ferait refuser toute la fiche fournisseur :
      // on crée le fournisseur sans, et on le signale sur la facture.
      ...(ibanValide(p.iban) ? { iban: normaliserIban(p.iban) } : {}),
      ...(email ? { emails: [email] } : {}),
      ...(p.address_line1 && p.postal_code && p.city
        ? { postal_address: { address: p.address_line1, postal_code: p.postal_code, city: p.city, country_alpha2: 'FR' } }
        : {}),
      external_reference: providerId,
    })
  }

  await supabase.from('inv_providers').update({ pennylane_supplier_id: id }).eq('id', providerId)
  return { id, ibanIgnore: Boolean(p.iban) && !ibanValide(p.iban), nom: p.legal_name }
}

/**
 * Pousse une facture dans Pennylane en facture d'achat.
 *
 * C'est ici que se joue le rapprochement qui cassait avant : le nom du
 * fournisseur vient de pennylane_supplier_id (et non du texte du PDF), et
 * les montants sont ceux valides en base, au centime pres.
 */
export async function syncInvoiceToPennylane(invoiceId: string): Promise<SyncResult> {
  const supabase = createServiceClient()

  try {
    const loaded = await loadInvoiceForRender(invoiceId)
    if (!loaded) throw new PennylaneError('Facture introuvable.')
    const { invoice, lines } = loaded

    let fournisseur: { id: number; ibanIgnore: boolean; nom: string }
    try {
      fournisseur = await resolveSupplier(invoice.provider_id)
    } catch (err) {
      throw new PennylaneError(
        `Fournisseur Pennylane introuvable et impossible à créer : ${err instanceof Error ? err.message : String(err)}. ` +
          'Renseignez son ID fournisseur dans sa fiche.'
      )
    }

    const uncategorised = lines.filter((l) => !l.pennylane_category_id)
    if (uncategorised.length > 0) {
      throw new PennylaneError(
        `Catégorie sans id_pennylane : ${[...new Set(uncategorised.map((l) => l.category_name))].join(', ')}. ` +
          'Complétez-la dans Catégories de missions.'
      )
    }

    // ---- 1. le PDF
    const pdf = await getInvoicePdf(invoiceId)
    const fileAttachmentId = await uploadFileAttachment(
      pdf,
      `${invoice.number.replace(/[^\w.-]/g, '_')}.pdf`
    )

    // ---- 2. la facture d'achat
    const pennylaneLines: PennylaneInvoiceLine[] = lines.map((l) => ({
      currency_amount: amount(l.total_ttc),
      currency_tax: amount(l.vat_amount),
      vat_rate: vatRateCode(Number(l.vat_rate)),
    }))

    const pennylaneInvoiceId = await importSupplierInvoice({
      file_attachment_id: fileAttachmentId,
      supplier_id: fournisseur.id,
      date: invoice.issue_date,
      deadline: invoice.due_date,
      invoice_number: invoice.number,
      currency_amount_before_tax: amount(invoice.subtotal_ht),
      currency_tax: amount(invoice.vat_amount),
      currency_amount: amount(invoice.total_ttc),
      label: `${invoice.issuer_snapshot.legal_name} — ${COMPANY.name}`,
      external_reference: invoice.id,
      invoice_lines: pennylaneLines,
    })

    // ---- 3. la ventilation analytique
    // Non bloquante : la facture existe deja dans Pennylane, on ne la perd pas
    // parce que la categorisation a echoue. L'admin peut resynchroniser.
    let categoryWarning: string | null = fournisseur.ibanIgnore
      ? `IBAN de ${fournisseur.nom} non repris dans Pennylane : sa clé de contrôle est fausse. Demandez-lui de le corriger dans ses informations, puis complétez la fiche fournisseur.`
      : null
    try {
      const weights = categoryWeights(lines)
      if (weights.length > 0) {
        await setSupplierInvoiceCategories(pennylaneInvoiceId, weights)
      }
    } catch (err) {
      categoryWarning =
        [categoryWarning, 'Facture créée dans Pennylane, mais la ventilation par catégorie a échoué : ' +
          (err instanceof Error ? err.message : String(err))].filter(Boolean).join(' ')
      console.error('[pennylane:categories]', err)
    }

    await supabase
      .from('inv_invoices')
      .update({
        pennylane_status: 'synced',
        pennylane_invoice_id: pennylaneInvoiceId,
        pennylane_file_attachment_id: fileAttachmentId,
        pennylane_error: categoryWarning,
        pennylane_synced_at: new Date().toISOString(),
      })
      .eq('id', invoiceId)

    return { ok: true, pennylaneInvoiceId }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await supabase
      .from('inv_invoices')
      .update({ pennylane_status: 'error', pennylane_error: message })
      .eq('id', invoiceId)
    return { ok: false, error: message }
  }
}

/** Statuts Pennylane qui valent « réglée ». */
const PAYEE = new Set(['fully_paid', 'paid_offline'])

export interface RetourEnvois {
  tentees: number
  envoyees: string[]
  echecs: { numero: string; motif: string }[]
}

/**
 * Pousse en comptabilité tout ce qui attend, et réessaie ce qui a échoué.
 *
 * L'envoi était un bouton : il fallait y penser, cocher trente-sept lignes,
 * et recommencer quand Pennylane en refusait la moitié. Une facture vérifiée
 * n'a aucune raison d'attendre un clic — elle part, et si la comptabilité
 * est indisponible ce jour-là, elle repartira demain.
 *
 * On traite par lots raisonnables : le débit est limité, et une tâche qui
 * s'éternise finit par être interrompue.
 */
export async function pousserEnAttente(max = 40): Promise<RetourEnvois> {
  const out: RetourEnvois = { tentees: 0, envoyees: [], echecs: [] }
  if (!isPennylaneConfigured()) return out

  const db = createServiceClient()
  const { data } = await db
    .from('inv_invoices')
    .select('id, number')
    .eq('brand', getBrandId())
    .in('status', ['sent', 'validated'])
    .neq('pennylane_status', 'synced')
    .order('issue_date')
    .limit(max)

  for (const f of (data ?? []) as { id: string; number: string }[]) {
    out.tentees++
    // L'envoi vaut vérification : on ne pousse que ce qu'on accepte de payer.
    await db
      .from('inv_invoices')
      .update({ status: 'validated', validated_at: new Date().toISOString() })
      .eq('id', f.id)
      .eq('status', 'sent')
    const r = await syncInvoiceToPennylane(f.id)
    if (r.ok) out.envoyees.push(f.number)
    else out.echecs.push({ numero: f.number, motif: r.error ?? 'erreur inconnue' })
    await new Promise((res) => setTimeout(res, 300))
  }
  return out
}

export interface RetourPaiements {
  verifiees: number
  payees: { number: string; provider: string }[]
  /** Reconnues dans la comptabilité sans y avoir été poussées. */
  rapprochees: { number: string; provider: string; libelle: string; date: string }[]
  erreurs: string[]
}

const sansAccent = (s: string | null | undefined) =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\(label genere\)/g, '')
    .replace(/^facture\s+/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const motsDe = (s: string) => sansAccent(s).split(' ').filter((m) => m.length >= 3)

/** Le même nom, écrit dans l'autre sens ou suivi d'un numéro de pièce. */
function memeNom(a: string, b: string): boolean {
  const ma = motsDe(a)
  const mb = motsDe(b)
  if (ma.length === 0 || mb.length === 0) return false
  return ma.filter((m) => mb.includes(m)).length >= Math.min(2, ma.length, mb.length)
}

/**
 * Relit dans Pennylane l'état des factures qu'on y a poussées, et marque
 * payées celles qui le sont.
 *
 * Le paiement se fait dans Pennylane, pas ici : sans cette relecture, le
 * statut de la plateforme resterait éternellement « validée » et les
 * relances repartiraient pour des factures déjà réglées.
 */
export async function rafraichirPaiements(): Promise<RetourPaiements> {
  const out: RetourPaiements = { verifiees: 0, payees: [], rapprochees: [], erreurs: [] }
  if (!isPennylaneConfigured()) return out

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('inv_invoices')
    .select('id, number, pennylane_invoice_id, provider:inv_providers(legal_name)')
    .eq('brand', getBrandId())
    .eq('pennylane_status', 'synced')
    .not('pennylane_invoice_id', 'is', null)
    .neq('status', 'paid')
    .limit(300)

  for (const f of (data ?? []) as unknown as {
    id: string
    number: string
    pennylane_invoice_id: number
    provider: { legal_name: string } | null
  }[]) {
    out.verifiees++
    try {
      const etat = await getSupplierInvoice(Number(f.pennylane_invoice_id))
      const reste = Number(etat.remaining_amount_with_tax ?? '0')
      const payee = etat.paid === true || PAYEE.has(etat.payment_status ?? '') || (etat.paid !== false && reste === 0 && Boolean(etat.payment_status))
      if (!payee) continue

      const { data: maj } = await supabase
        .from('inv_invoices')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('id', f.id)
        .neq('status', 'paid')
        .select('id')
      if (maj?.length) out.payees.push({ number: f.number, provider: f.provider?.legal_name ?? '—' })
    } catch (err) {
      out.erreurs.push(`${f.number} : ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  await rapprocherSansPoussee(supabase, out)
  return out
}

/**
 * Reconnaître dans la comptabilité une facture qu'on ne lui a jamais
 * envoyée.
 *
 * La relecture ci-dessus suit l'identifiant Pennylane : elle ne voit que ce
 * qu'on y a poussé. Or une facture peut très bien être réglée là-bas sans
 * être jamais passée par ici — elle y arrive par la boîte de dépôt du
 * cabinet, ou saisie à la main. Elle restait alors « à payer » chez nous
 * indéfiniment, et il fallait cocher soi-même ce que la banque savait déjà.
 *
 * On la reconnaît au couple nom + montant, dans la même période. C'est le
 * même critère que pour les doublons, et pour la même raison : un montant
 * seul ne désigne personne.
 */
async function rapprocherSansPoussee(
  supabase: ReturnType<typeof createServiceClient>,
  out: RetourPaiements
): Promise<void> {
  const { data } = await supabase
    .from('inv_invoices')
    .select('id, number, issue_date, total_ttc, provider:inv_providers(legal_name)')
    .eq('brand', getBrandId())
    .in('status', ['sent', 'validated'])
    .is('pennylane_invoice_id', null)
    .limit(200)

  const attente = (data ?? []) as unknown as {
    id: string
    number: string
    issue_date: string
    total_ttc: number
    provider: { legal_name: string } | null
  }[]
  if (attente.length === 0) return

  let comptables: Awaited<ReturnType<typeof listSupplierInvoices>>
  try {
    comptables = await listSupplierInvoices({ pages: 3 })
  } catch (err) {
    out.erreurs.push(`comptabilité illisible : ${err instanceof Error ? err.message : String(err)}`)
    return
  }

  const reglees = comptables.filter(
    (f) => f.paid === true || f.payment_status === 'paid' || f.payment_status === 'paid_offline' || f.payment_status === 'fully_paid'
  )
  const centimes = (n: number) => Math.round(Number(n) * 100)
  const jour = (d: string) => new Date(`${d}T12:00:00Z`).getTime()

  for (const f of attente) {
    const nom = f.provider?.legal_name ?? ''
    const trouvee = reglees.find(
      (c) =>
        centimes(Number(c.amount)) === centimes(f.total_ttc) &&
        Math.abs(jour(c.date) - jour(f.issue_date)) <= 60 * 864e5 &&
        memeNom(nom, c.supplier?.name ?? c.label ?? '')
    )
    if (!trouvee) continue

    // On retient l'identifiant : la prochaine relecture passera par le
    // chemin direct, sans avoir à redeviner.
    const { data: maj } = await supabase
      .from('inv_invoices')
      .update({ status: 'paid', paid_at: new Date().toISOString(), pennylane_invoice_id: trouvee.id })
      .eq('id', f.id)
      .neq('status', 'paid')
      .select('id')
    if (maj?.length) {
      out.rapprochees.push({
        number: f.number,
        provider: nom || '—',
        libelle: (trouvee.supplier?.name ?? trouvee.label ?? '—').replace(/\s*\(label généré\)\s*$/, ''),
        date: trouvee.date,
      })
    }
  }
}
