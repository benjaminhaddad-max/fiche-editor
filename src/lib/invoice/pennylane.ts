import {
  PennylaneError,
  amount,
  createSupplier,
  getSupplier,
  getSupplierInvoice,
  isPennylaneConfigured,
  variableJetonPennylane,
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
import { societeDe, type AiCheck, type InvoiceLine } from '@/lib/types'
import { MOTIF_ECART_BLOQUE, aVerifier } from '@/lib/invoice/ecart'
import { activeBrand, activeBrandId, sousMarque } from '@/lib/brand/actif'
import { BRANDS, estSiretMaison, normalizeBrandId } from '@/lib/brand/config'

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
 * Le fournisseur trouvé est-il bien cette personne ?
 *
 * Trois signes, et il en faut un.
 *
 *   · le nom concorde, mot à mot — « GALBOIS Salomé » vaut « Salomé Galbois » ;
 *   · l'IBAN enregistré est le sien ;
 *   · la comptabilité n'a pas d'IBAN du tout, donc rien à écraser.
 *
 * Sans aucun des trois, on s'arrête. Ella Benais s'est retrouvée rattachée à
 * « ASSIA TALHAOUI » et Sousitra Manicome à « PACHIAUDI » : des fournisseurs
 * réels, avec leur propre RIB. Écrire l'IBAN de nos prestataires dans ces
 * comptes-là aurait détourné les virements de deux tiers, durablement et
 * sans que rien ne le signale.
 */
function memeFournisseur(
  pennylaneNom: string,
  pennylaneIban: string | null | undefined,
  fiche: { legal_name: string; iban: string | null }
): boolean {
  const mots = (x: string) =>
    (x ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .split(' ')
      .filter((m) => m.length >= 3)
  const a = mots(pennylaneNom)
  const b = mots(fiche.legal_name)
  const communs = a.filter((m) => b.includes(m)).length
  if (a.length && b.length && communs >= Math.min(2, a.length, b.length)) return true

  const net = (x: string | null | undefined) => (x ?? '').replace(/\s+/g, '').toUpperCase()
  const chezEux = net(pennylaneIban)
  if (!chezEux) return true
  return chezEux === net(fiche.iban)
}

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
  fiche: { legal_name: string; iban: string | null }
): Promise<void> {
  const actuel = await getSupplier(supplierId)

  // Avant d'écrire quoi que ce soit : est-ce bien lui ?
  if (!memeFournisseur(actuel.name ?? '', actuel.iban, fiche)) {
    throw new PennylaneError(
      `Le fournisseur « ${actuel.name} » rattaché à ${fiche.legal_name} ne lui correspond pas : ` +
        'ni le nom, ni l’IBAN. Vérifiez le rattachement avant d’envoyer cette facture — ' +
        'écrire son IBAN ici détournerait les virements de quelqu’un d’autre.'
    )
  }

  if (!ibanValide(fiche.iban)) return
  const voulu = normaliserIban(fiche.iban)
  const aPennylane = (actuel.iban ?? '').replace(/\s+/g, '').toUpperCase()
  if (aPennylane === voulu) return
  await updateSupplier(supplierId, { iban: voulu })
  console.info('[pennylane] IBAN recalé pour', fiche.legal_name)
}

async function resolveSupplier(
  providerId: string
): Promise<{ id: number; ibanIgnore: boolean; nom: string; avertissement?: string }> {
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
    await alignerIban(Number(p.pennylane_supplier_id), { legal_name: p.legal_name, iban: p.iban })
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
  let avertissement: string | undefined
  // Un fournisseur trouvé par le SIREN n'est pas forcément la bonne
  // personne : deux fiches peuvent porter le même numéro par erreur de
  // saisie. On le vérifie avant de s'y attacher, pas après le virement.
  const complet = trouve ? await getSupplier(trouve.id) : null
  const autrePersonne = Boolean(trouve && complet && !memeFournisseur(complet.name ?? trouve.name, complet.iban, p))
  if (trouve && !autrePersonne) {
    id = trouve.id
  } else {
    // Le SIRET désigne quelqu'un d'autre (Matheo Mettoudi avait saisi celui
    // de Diane) : on ne s'attache surtout pas à ce fournisseur, ce serait la
    // payer elle. Mais on ne bloque plus la facture non plus — elle restait
    // validée ici et absente de la comptabilité, donc jamais payée. On crée
    // le fournisseur à son nom et à son IBAN, sans le SIRET douteux.
    if (autrePersonne) {
      avertissement =
        `SIRET de ${p.legal_name} à vérifier : il désigne « ${complet?.name} » dans la comptabilité. ` +
        'Fournisseur créé à son nom, sans SIRET.'
    }
    const email = p.contact_email ?? (p as unknown as { user: { email: string } | null }).user?.email
    id = await createSupplier({
      name: p.legal_name,
      ...(!autrePersonne && /^\d{14}$/.test(siret) ? { establishment_no: siret, reg_no: siret.slice(0, 9) } : {}),
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
  return { id, ibanIgnore: Boolean(p.iban) && !ibanValide(p.iban), nom: p.legal_name, avertissement }
}

/**
 * Pousse une facture dans Pennylane en facture d'achat.
 *
 * C'est ici que se joue le rapprochement qui cassait avant : le nom du
 * fournisseur vient de pennylane_supplier_id (et non du texte du PDF), et
 * les montants sont ceux valides en base, au centime pres.
 */
export async function syncInvoiceToPennylane(invoiceId: string): Promise<SyncResult> {
  // Le Pennylane, et donc le jeton, sont ceux de l'école de la facture, pas
  // ceux de l'écran ou du déploiement d'où part l'envoi.
  const { data } = await createServiceClient().from('inv_invoices').select('brand').eq('id', invoiceId).maybeSingle()
  if (!data) return envoyerFacture(invoiceId)
  return sousMarque(normalizeBrandId(data.brand as string), () => envoyerFacture(invoiceId))
}

async function envoyerFacture(invoiceId: string): Promise<SyncResult> {
  const supabase = createServiceClient()

  try {
    const loaded = await loadInvoiceForRender(invoiceId)
    if (!loaded) throw new PennylaneError('Facture introuvable.')
    const { invoice, lines } = loaded

    // Écart de montant non validé : rien ne part en comptabilité.
    if (aVerifier(invoice)) {
      return { ok: false, error: MOTIF_ECART_BLOQUE }
    }

    // Une école sans comptabilité n'a rien à faire dans un Pennylane : le
    // simple fait d'essayer y crée le fournisseur. On lit l'école de la
    // facture, pas celle du déploiement.
    if (!BRANDS[normalizeBrandId(invoice.brand)].comptabilite) {
      return { ok: false, error: 'Cette école n’a pas de comptabilité Pennylane.' }
    }
    // Son propre jeton, ou rien : jamais celui d'une autre école.
    if (!(await isPennylaneConfigured())) {
      return { ok: false, error: `${await variableJetonPennylane()} absent : la comptabilité de cette école n’est pas encore reliée.` }
    }

    let fournisseur: { id: number; ibanIgnore: boolean; nom: string; avertissement?: string }
    try {
      fournisseur = await resolveSupplier(invoice.provider_id)
    } catch (err) {
      throw new PennylaneError(
        `Fournisseur Pennylane introuvable et impossible à créer : ${err instanceof Error ? err.message : String(err)}. ` +
          'Renseignez son ID fournisseur dans sa fiche.'
      )
    }

    // Une catégorie sans id_pennylane bloquait toute la facture : validée
    // ici, absente de la comptabilité, donc jamais payée. Sept factures
    // d'octobre 2026 ont dormi ainsi. Elle part désormais, avec une
    // catégorie devinée — ou aucune —, et on le dit sur la facture.
    const devinees = await devinerCategories(lines, invoice.brand)

    // Les catégories communes à toutes les écoles portent les numéros du
    // Pennylane de Diploma. Ailleurs, seules comptent celles de l'école.
    if (normalizeBrandId(invoice.brand) !== 'diploma') {
      const { data: cats } = await supabase
        .from('inv_categories')
        .select('pennylane_category_id')
        .eq('brand', invoice.brand)
        .not('pennylane_category_id', 'is', null)
      const siennes = new Set((cats ?? []).map((c) => Number(c.pennylane_category_id)))
      const etrangeres = lines.filter((l) => l.pennylane_category_id && !siennes.has(Number(l.pennylane_category_id)))
      if (etrangeres.length > 0) {
        throw new PennylaneError(
          `Catégorie reliée au Pennylane d'une autre école : ${[...new Set(etrangeres.map((l) => l.category_name))].join(', ')}. ` +
            'Créez-la pour cette école, avec son id_pennylane, dans Catégories de missions.'
        )
      }
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
      label: `${invoice.issuer_snapshot.legal_name} — ${societeDe(invoice.brand).name}`,
      external_reference: invoice.id,
      invoice_lines: pennylaneLines,
    })

    // ---- 3. la ventilation analytique
    // Non bloquante : la facture existe deja dans Pennylane, on ne la perd pas
    // parce que la categorisation a echoue. L'admin peut resynchroniser.
    let categoryWarning: string | null =
      [
        fournisseur.ibanIgnore
          ? `IBAN de ${fournisseur.nom} non repris dans Pennylane : sa clé de contrôle est fausse. Demandez-lui de le corriger dans ses informations, puis complétez la fiche fournisseur.`
          : null,
        fournisseur.avertissement ?? null,
        devinees.avertissement,
      ]
        .filter(Boolean)
        .join(' ') || null
    try {
      const weights = categoryWeights(devinees.lignes)
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

/** Préfixe de l'avertissement porté par une facture partie avec une catégorie devinée. */
export const CATEGORIE_DEVINEE = 'Catégorie Pennylane devinée'

/**
 * Donne une catégorie Pennylane aux lignes qui n'en ont pas.
 *
 * Dans l'ordre : une catégorie du même pôle qui en a une ; pour un frais
 * (Pass Navigo, repas), la catégorie la plus lourde de la même facture — il
 * suit le travail qu'il a servi à faire ; pour le reste du pôle « autres »
 * (salons, JPO), la catégorie « Autres ». Sinon rien : la facture part
 * quand même, simplement non ventilée.
 */
async function devinerCategories(
  lines: InvoiceLine[],
  brand: string
): Promise<{ lignes: InvoiceLine[]; avertissement: string | null }> {
  const manquantes = lines.filter((l) => !l.pennylane_category_id)
  if (manquantes.length === 0) return { lignes: lines, avertissement: null }

  const db = createServiceClient()
  const { data: cats } = await db
    .from('inv_categories')
    .select('name, pole, pennylane_category_id, sort_order')
    .in('brand', [brand, 'all'])
    .order('sort_order')
  const toutes = (cats ?? []) as { name: string; pole: string | null; pennylane_category_id: number | null }[]
  const poleDe = new Map(toutes.map((c) => [c.name, c.pole]))
  const parPole = new Map<string, { id: number; name: string }>()
  for (const c of toutes) {
    if (c.pole && c.pole !== 'autres' && c.pennylane_category_id && !parPole.has(c.pole)) {
      parPole.set(c.pole, { id: Number(c.pennylane_category_id), name: c.name })
    }
  }
  // « Autres » a son propre numéro : c'est la catégorie de repli du pôle.
  const autres = toutes.find((c) => c.name === 'Autres' && c.pennylane_category_id)
  if (autres) parPole.set('autres', { id: Number(autres.pennylane_category_id), name: autres.name })

  const poids = new Map<number, { total: number; name: string }>()
  for (const l of lines) {
    if (!l.pennylane_category_id) continue
    const p = poids.get(l.pennylane_category_id) ?? { total: 0, name: l.category_name ?? '' }
    p.total += Number(l.total_ht)
    poids.set(l.pennylane_category_id, p)
  }
  const dominante = [...poids.entries()].sort((a, b) => b[1].total - a[1].total)[0]

  const choix = new Map<string, string>()
  const lignes = lines.map((l) => {
    if (l.pennylane_category_id) return l
    const nom = l.category_name ?? '—'
    const pole = poleDe.get(nom)
    const memePole = pole && pole !== 'autres' ? parPole.get(pole) : undefined
    const laDominante = dominante ? { id: dominante[0], name: dominante[1].name } : undefined
    // Un frais suit le travail qu'il a servi à faire ; le reste du pôle
    // « autres » (salons, JPO…) va sur la catégorie « Autres ».
    const estFrais = /frais|rembours|transport|navigo|repas/i.test(nom)
    const devinee =
      memePole ?? (estFrais ? laDominante ?? parPole.get('autres') : parPole.get('autres') ?? laDominante)
    choix.set(nom, devinee ? `${nom} → ${devinee.name}` : `${nom} → aucune`)
    return devinee ? { ...l, pennylane_category_id: devinee.id } : l
  })

  return {
    lignes,
    avertissement: `${CATEGORIE_DEVINEE} (catégorie sans id_pennylane) : ${[...choix.values()].join(', ')}. ` +
      'Vérifiez la ventilation dans Pennylane et complétez la catégorie dans Catégories de missions.',
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
  if (!(await isPennylaneConfigured()) || !(await activeBrand()).comptabilite) return out

  const db = createServiceClient()
  const { data } = await db
    .from('inv_invoices')
    .select('id, number, ai_check, ecart_valide_at')
    .eq('brand', (await activeBrandId()))
    .in('status', ['sent', 'validated'])
    .neq('pennylane_status', 'synced')
    .order('issue_date')
    .limit(max)

  for (const f of (data ?? []) as unknown as { id: string; number: string; ai_check: AiCheck | null; ecart_valide_at: string | null }[]) {
    // Écart de montant non validé : la facture attend un administrateur, elle
    // n'est ni validée ni poussée en comptabilité toute seule.
    if (aVerifier(f)) continue
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
  if (!(await isPennylaneConfigured()) || !(await activeBrand()).comptabilite) return out

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('inv_invoices')
    .select('id, number, pennylane_invoice_id, ai_check, ecart_valide_at, provider:inv_providers(legal_name)')
    .eq('brand', (await activeBrandId()))
    .eq('pennylane_status', 'synced')
    .not('pennylane_invoice_id', 'is', null)
    .neq('status', 'paid')
    .limit(300)

  for (const f of (data ?? []) as unknown as {
    id: string
    number: string
    pennylane_invoice_id: number
    ai_check: AiCheck | null
    ecart_valide_at: string | null
    provider: { legal_name: string } | null
  }[]) {
    out.verifiees++
    // Écart non validé : on ne marque pas payée, même si la comptabilité dit
    // l'avoir réglée. On le signale pour qu'un administrateur tranche.
    if (aVerifier(f)) {
      out.erreurs.push(`${f.number} : écart de montant à vérifier, non marquée payée`)
      continue
    }
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
    .select('id, number, issue_date, total_ttc, ai_check, ecart_valide_at, provider:inv_providers(legal_name)')
    .eq('brand', (await activeBrandId()))
    .in('status', ['sent', 'validated'])
    .is('pennylane_invoice_id', null)
    .limit(200)

  const attente = (data ?? []) as unknown as {
    id: string
    number: string
    issue_date: string
    total_ttc: number
    ai_check: AiCheck | null
    ecart_valide_at: string | null
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

  // Une facture réglée en comptabilité ne paie qu'une facture d'ici. Un
  // prestataire au forfait envoie le même montant tous les mois : sans ce
  // garde-fou, la facture d'octobre, déjà réglée et déjà rattachée à sa
  // jumelle de septembre, faisait passer pour payée celle de novembre
  // (Clara Vincent, FACT-2026-0003, rattachée au virement de FACT-2026-0002).
  const { data: dejaPrises, error: errPrises } = await supabase
    .from('inv_invoices')
    .select('pennylane_invoice_id')
    .not('pennylane_invoice_id', 'is', null)
  if (errPrises) {
    out.erreurs.push(`rapprochement suspendu : ${errPrises.message}`)
    return
  }
  const prises = new Set(
    ((dejaPrises ?? []) as { pennylane_invoice_id: number | string }[]).map((r) => String(r.pennylane_invoice_id))
  )

  for (const f of attente) {
    if (aVerifier(f)) continue
    const nom = f.provider?.legal_name ?? ''
    const trouvee = reglees.find(
      (c) =>
        !prises.has(String(c.id)) &&
        centimes(Number(c.amount)) === centimes(f.total_ttc) &&
        Math.abs(jour(c.date) - jour(f.issue_date)) <= 60 * 864e5 &&
        memeNom(nom, c.supplier?.name ?? c.label ?? '')
    )
    if (!trouvee) continue
    prises.add(String(trouvee.id))

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
