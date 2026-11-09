import { randomUUID } from 'node:crypto'
import { addDays, round2 } from '@/lib/format'
import { INVOICE_BUCKET } from '@/lib/invoice/store'
import { createServiceClient } from '@/lib/supabase/service'
import { activeBrand, activeBrandId } from '@/lib/brand/actif'
import {
  amount,
  appelPennylane,
  autorisationPennylane,
  chercherFactureAchat,
  setSupplierInvoicePaymentStatus,
  createSupplier,
  importSupplierInvoice,
  isPennylaneConfigured,
  listSuppliers,
  matchTransaction,
  uploadFileAttachment,
  vatRateCode,
} from '@/lib/pennylane/client'
import { lireMouvements, type Mouvement } from '@/lib/pennylane/depenses'
import { lireRecu } from '@/lib/justificatifs/recu'
import { candidats, motsDuNom, rapprochementSur, TOLERANCE_JOURS, type Candidat } from '@/lib/justificatifs/correspondance'
import { lireReglages } from '@/lib/justificatifs/reglages'

const BASE_URL = process.env.PENNYLANE_API_URL ?? 'https://app.pennylane.com/api/external/v2'

export interface Justificatif {
  id: string
  created_at: string
  fournisseur: string | null
  marque: string | null
  date_paiement: string | null
  montant: number | null
  devise: string
  montant_tva: number | null
  taux_tva: number | null
  numero: string | null
  carte: string | null
  recu_le: string | null
  source: 'depot' | 'gmail'
  pdf_path: string
  filename: string
  inbound_from: string | null
  statut: 'a_rattacher' | 'rattache' | 'ignore'
  candidats: Candidat[]
  transaction_id: number | null
  transaction_label: string | null
  transaction_date: string | null
  transaction_montant: number | null
  pennylane_supplier_id: number | null
  pennylane_invoice_id: number | null
  rattache_le: string | null
  rattache_par: string | null
  erreur: string | null
}

const COLONNES =
  'id, created_at, fournisseur, marque, date_paiement, montant, devise, montant_tva, taux_tva, numero, carte, recu_le, source, pdf_path, filename, inbound_from, statut, candidats, transaction_id, transaction_label, transaction_date, transaction_montant, pennylane_supplier_id, pennylane_invoice_id, rattache_le, rattache_par, erreur'

const recuLu = (j: Justificatif) => ({
  fournisseur: j.fournisseur,
  marque: j.marque,
  date: j.date_paiement,
  montant: j.montant === null ? null : Number(j.montant),
  devise: j.devise,
  carte: j.carte,
  horodatage: j.recu_le,
})

/**
 * Un reçu arrive — par la boîte de dépôt ou relevé dans celle de Ben : on
 * le lit, on le garde, on cherche son mouvement, et il entre dans Pennylane
 * dans tous les cas. Le même PDF est donc des deux côtés : ici dans
 * l'onglet Dépenses, là-bas en facture d'achat, rattachée au paiement quand
 * le rapprochement est sûr.
 *
 * Il ne devient pas une facture à valider ici : il est déjà payé. Il ne
 * crée pas non plus de fiche prestataire — Anthropic n'a rien à déclarer
 * sur Diploma Invoice.
 */
export async function enregistrerRecu(input: {
  pdf: Buffer
  filename: string
  emailMessageId: string | null
  inboundFrom: string | null
  /** L'heure d'arrivée du mail (ISO). */
  recuLe?: string | null
  source?: 'depot' | 'gmail'
}): Promise<{ ok: boolean; id?: string; statut?: string; error?: string }> {
  const db = createServiceClient()
  const brand = await activeBrandId()

  if (input.emailMessageId) {
    const { data: deja } = await db
      .from('inv_justificatifs')
      .select('id, statut')
      .eq('email_message_id', input.emailMessageId)
      .eq('filename', input.filename)
      .maybeSingle()
    if (deja) return { ok: true, id: deja.id, statut: deja.statut }
  }

  let lu
  try {
    lu = await lireRecu(input.pdf)
  } catch (err) {
    console.error('[justificatifs] lecture impossible', err)
    return { ok: false, error: 'Le reçu n’a pas pu être lu.' }
  }

  // Stripe joint la facture ET le reçu du même paiement (Anthropic,
  // Cursor…). Le second ne justifie rien de plus : on le garde, écarté.
  let jumeau: string | null = null
  if (input.emailMessageId && lu.montant !== null) {
    const { data: freres } = await db
      .from('inv_justificatifs')
      .select('filename, montant, date_paiement, devise')
      .eq('email_message_id', input.emailMessageId)
    jumeau =
      (freres ?? []).find(
        (f) => Number(f.montant) === lu.montant && f.devise === lu.devise && f.date_paiement === lu.date
      )?.filename ?? null
  }

  const id = randomUUID()
  const path = `justificatifs/${brand}/${id}.pdf`
  const { error: stockage } = await db.storage
    .from(INVOICE_BUCKET)
    .upload(path, input.pdf, { contentType: 'application/pdf', upsert: true })
  if (stockage) return { ok: false, error: `Stockage du reçu impossible : ${stockage.message}` }

  const { error } = await db.from('inv_justificatifs').insert({
    id,
    brand,
    fournisseur: lu.fournisseur,
    marque: lu.marque,
    date_paiement: lu.date,
    montant: lu.montant,
    devise: lu.devise,
    montant_tva: lu.montantTva,
    taux_tva: lu.tauxTva,
    numero: lu.numero,
    carte: lu.carte,
    recu_le: input.recuLe ?? null,
    source: input.source ?? 'depot',
    pdf_path: path,
    filename: input.filename,
    email_message_id: input.emailMessageId,
    inbound_from: input.inboundFrom,
    erreur: jumeau ? `Même paiement que « ${jumeau} », reçu dans le même message.` : lu.avertissement,
    ...(jumeau ? { statut: 'ignore' } : {}),
  })
  if (error) {
    await db.storage.from(INVOICE_BUCKET).remove([path])
    return { ok: false, error: `Enregistrement du reçu impossible : ${error.message}` }
  }

  if (jumeau) return { ok: true, id, statut: 'ignore' }
  const r = await rapprocherEnAttente({ ids: [id] })
  if (r.deposes > 0) return { ok: true, id, statut: 'rattache' }
  // Pas de mouvement sûr (encore) : le reçu entre quand même dans Pennylane.
  // S'il trouve son mouvement plus tard, c'est cette facture-là qu'on
  // rattachera, sans la réimporter.
  if ((await lireReglages()).miroirPennylane) await mettreEnMiroir(id)
  return { ok: true, id, statut: 'a_rattacher' }
}

export interface BilanRapprochement {
  examines: number
  deposes: number
  aRattacher: number
  erreurs: string[]
  /** Le dépôt automatique est éteint : les rapprochements sûrs attendent un clic. */
  depotAutoEteint: boolean
}

/**
 * Chaque reçu encore sans mouvement repasse au rapprochement.
 *
 * Un reçu arrive souvent avant son mouvement — la carte est débitée deux
 * jours plus tard, et Pennylane relit la banque une fois par jour. On le
 * reprend donc à chaque relève pendant dix jours ; au-delà, son mouvement
 * ne viendra plus, il reste dans la liste « À rattacher » et attend une main.
 *
 * Les mouvements sont lus une seule fois pour tous les reçus, sur la
 * fenêtre qui les couvre tous.
 */
export async function rapprocherEnAttente(opts: { ids?: string[] } = {}): Promise<BilanRapprochement> {
  const bilan: BilanRapprochement = { examines: 0, deposes: 0, aRattacher: 0, erreurs: [], depotAutoEteint: false }
  if (!(await isPennylaneConfigured()) || !(await activeBrand()).comptabilite) return bilan

  const db = createServiceClient()
  let q = db
    .from('inv_justificatifs')
    .select(COLONNES)
    .eq('brand', await activeBrandId())
    .eq('statut', 'a_rattacher')
  q = opts.ids ? q.in('id', opts.ids) : q.gte('created_at', addDays(new Date().toISOString().slice(0, 10), -10))
  const { data } = await q
  const recus = ((data ?? []) as unknown as Justificatif[]).filter((j) => j.date_paiement && j.montant !== null)
  if (!recus.length) return bilan

  const dates = recus.map((j) => j.date_paiement!).sort()
  let mouvements: Mouvement[]
  try {
    mouvements = await lireMouvements(addDays(dates[0], -TOLERANCE_JOURS), addDays(dates[dates.length - 1], TOLERANCE_JOURS), {
      cache: 0,
    })
  } catch (err) {
    bilan.erreurs.push(`Mouvements illisibles : ${err instanceof Error ? err.message : String(err)}`)
    return bilan
  }

  // Un mouvement déjà justifié par un autre reçu d'ici n'est plus libre.
  const { data: pris } = await db.from('inv_justificatifs').select('transaction_id').not('transaction_id', 'is', null)
  const occupes = new Set((pris ?? []).map((p) => Number(p.transaction_id)))
  const libres = mouvements.filter((m) => m.justificatifManquant && !occupes.has(m.id))

  const reglages = await lireReglages()
  for (const j of recus) {
    bilan.examines++
    const liste = candidats(recuLu(j), libres).slice(0, 8)
    await db
      .from('inv_justificatifs')
      .update({ candidats: liste, rapproche_le: new Date().toISOString() })
      .eq('id', j.id)

    const sur = rapprochementSur(recuLu(j), liste)
    if (sur && !reglages.depotAuto) bilan.depotAutoEteint = true
    if (!sur || !reglages.depotAuto) {
      bilan.aRattacher++
      continue
    }
    const r = await deposer(j.id, sur.id, 'auto')
    if (r.ok) {
      bilan.deposes++
      occupes.add(sur.id)
      const i = libres.findIndex((m) => m.id === sur.id)
      if (i >= 0) libres.splice(i, 1)
    } else {
      bilan.aRattacher++
      bilan.erreurs.push(`${j.marque ?? j.fournisseur ?? j.filename} : ${r.error}`)
    }
  }
  return bilan
}

interface TransactionPennylane {
  id: number
  date: string
  label: string | null
  amount: string
  attachment_required?: boolean
  supplier?: { id?: number | null; name?: string | null } | null
}

async function lireTransaction(id: number): Promise<TransactionPennylane> {
  const res = await appelPennylane(`${BASE_URL}/transactions/${id}`, {
    headers: await autorisationPennylane(),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Pennylane ${res.status} sur le mouvement ${id}`)
  return (await res.json()) as TransactionPennylane
}

/**
 * Le fournisseur Pennylane du reçu : celui que le mouvement porte déjà,
 * sinon celui qui porte le même nom, sinon un nouveau.
 *
 * L'import d'une facture d'achat exige un fournisseur ; c'est la seule
 * raison pour laquelle on en crée un.
 */
async function fournisseurPennylane(j: Justificatif, t: TransactionPennylane | null): Promise<number> {
  if (t?.supplier?.id) return t.supplier.id
  const nom = (j.marque ?? j.fournisseur ?? '').trim()
  const mots = motsDuNom(j.marque, j.fournisseur)
  const tous = await listSuppliers()
  const trouve =
    tous.find((s) => s.name.trim().toLowerCase() === nom.toLowerCase()) ??
    tous.find((s) => {
      const siens = motsDuNom(s.name)
      return siens.length > 0 && siens[0] === mots[0]
    })
  if (trouve) return trouve.id
  return createSupplier({ name: nom || 'Fournisseur inconnu' })
}

/**
 * Pose un reçu sur un mouvement, dans Pennylane.
 *
 * L'API ne sait pas accrocher un fichier à une transaction : on importe le
 * reçu en facture d'achat (file_attachments:all, supplier_invoices:all),
 * puis on lui rattache le mouvement (supplier_invoices:all). Si la seconde
 * étape échoue, la facture importée est gardée et seule elle sera rejouée :
 * l'importer deux fois doublerait la charge.
 */
export async function deposer(
  id: string,
  transactionId: number,
  par: string
): Promise<{ ok: boolean; error?: string }> {
  const db = createServiceClient()
  const { data } = await db.from('inv_justificatifs').select(COLONNES).eq('id', id).eq('brand', await activeBrandId()).maybeSingle()
  const j = data as unknown as Justificatif | null
  if (!j) return { ok: false, error: 'Reçu introuvable.' }
  if (j.statut === 'rattache') return { ok: true }
  if (j.montant === null || !j.date_paiement) return { ok: false, error: 'Montant ou date illisible sur le reçu.' }

  const echec = async (message: string) => {
    await db.from('inv_justificatifs').update({ erreur: message }).eq('id', id)
    return { ok: false, error: message }
  }

  try {
    const t = await lireTransaction(transactionId)
    if (Number(t.amount) >= 0) return echec('Ce mouvement est une entrée d’argent, pas une dépense.')
    if (t.attachment_required === false) return echec('Ce mouvement est déjà justifié dans Pennylane.')

    const { data: autre } = await db
      .from('inv_justificatifs')
      .select('id')
      .eq('transaction_id', transactionId)
      .neq('id', id)
      .maybeSingle()
    if (autre) return echec('Un autre reçu est déjà posé sur ce mouvement.')

    const factureId = j.pennylane_invoice_id ?? (await importer(j, t))
    if (!factureId) return echec('PDF du reçu introuvable dans le stockage.')

    await matchTransaction(factureId, transactionId)
    await db
      .from('inv_justificatifs')
      .update({
        statut: 'rattache',
        transaction_id: transactionId,
        transaction_label: t.label,
        transaction_date: t.date,
        transaction_montant: -Number(t.amount),
        rattache_le: new Date().toISOString(),
        rattache_par: par,
        erreur: null,
      })
      .eq('id', id)
    return { ok: true }
  } catch (err) {
    console.error('[justificatifs] dépôt', id, err)
    return echec(err instanceof Error ? err.message.slice(0, 500) : String(err))
  }
}

/**
 * Le reçu en facture d'achat dans Pennylane : PDF déposé
 * (file_attachments:all), facture importée (supplier_invoices:all).
 *
 * Avant d'importer, on regarde si Pennylane l'a déjà — sous notre
 * référence (un import interrompu), ou sous le même numéro et le même
 * montant (un reçu arrivé par un autre chemin). L'importer deux fois
 * doublerait la charge.
 */
async function importer(j: Justificatif, t: TransactionPennylane | null): Promise<number | null> {
  const db = createServiceClient()
  const ttc = Number(j.montant)
  const reference = `justificatif-${j.id}`

  const existante =
    (await chercherFactureAchat('external_reference', reference))[0] ??
    (j.numero
      ? (await chercherFactureAchat('invoice_number', j.numero)).find((f) => Math.abs(Number(f.amount) - ttc) < 0.01 || j.devise !== 'EUR')
      : undefined)
  if (existante) {
    await db.from('inv_justificatifs').update({ pennylane_invoice_id: existante.id }).eq('id', j.id)
    return existante.id
  }

  const fournisseurId = j.pennylane_supplier_id ?? (await fournisseurPennylane(j, t))
  const { data: fichier, error: lecture } = await db.storage.from(INVOICE_BUCKET).download(j.pdf_path)
  if (lecture || !fichier) return null
  const attachement = await uploadFileAttachment(Buffer.from(await fichier.arrayBuffer()), j.filename)

  let taxe = j.montant_tva === null ? 0 : Number(j.montant_tva)
  let code = 'exempt'
  try {
    code = vatRateCode(Number(j.taux_tva ?? 0))
  } catch {
    // Un taux étranger (TVA irlandaise à 23 %) n'a pas de code français :
    // le reçu part toutes taxes comprises, le cabinet ventilera.
    taxe = 0
  }
  if (code === 'exempt') taxe = 0
  const ht = round2(ttc - taxe)

  const factureId = await importSupplierInvoice({
    file_attachment_id: attachement,
    supplier_id: fournisseurId,
    date: j.date_paiement!,
    deadline: j.date_paiement!,
    invoice_number: j.numero ?? undefined,
    currency: j.devise,
    currency_amount_before_tax: amount(ht),
    currency_tax: amount(taxe),
    currency_amount: amount(ttc),
    label: `${j.marque ?? j.fournisseur ?? 'Reçu'} — reçu${j.numero ? ` ${j.numero}` : ''}`,
    external_reference: reference,
    invoice_lines: [{ currency_amount: amount(ttc), currency_tax: amount(taxe), vat_rate: code }],
  })
  await db
    .from('inv_justificatifs')
    .update({ pennylane_invoice_id: factureId, pennylane_supplier_id: fournisseurId })
    .eq('id', j.id)
  return factureId
}

/**
 * Le reçu entre dans Pennylane sans mouvement rattaché.
 *
 * Il est marqué réglé : c'est un reçu, la carte a déjà payé. Laissé « à
 * payer », il apparaîtrait dans les factures hors plateforme à régler, et
 * quelqu'un finirait par payer Anthropic deux fois.
 */
export async function mettreEnMiroir(id: string): Promise<{ ok: boolean; error?: string }> {
  const db = createServiceClient()
  const { data } = await db.from('inv_justificatifs').select(COLONNES).eq('id', id).eq('brand', await activeBrandId()).maybeSingle()
  const j = data as unknown as Justificatif | null
  if (!j || j.statut === 'ignore') return { ok: false, error: 'Reçu introuvable.' }
  if (j.pennylane_invoice_id) return { ok: true }
  if (j.montant === null || !j.date_paiement) return { ok: false, error: 'Montant ou date illisible sur le reçu.' }
  try {
    const factureId = await importer(j, null)
    if (!factureId) return { ok: false, error: 'PDF du reçu introuvable dans le stockage.' }
    await setSupplierInvoicePaymentStatus(factureId, 'paid')
    return { ok: true }
  } catch (err) {
    console.error('[justificatifs] miroir', id, err)
    const message = err instanceof Error ? err.message.slice(0, 500) : String(err)
    await db.from('inv_justificatifs').update({ erreur: message }).eq('id', id)
    return { ok: false, error: message }
  }
}

/** Les reçus de l'école, pour l'écran Dépenses. */
export async function listerJustificatifs(): Promise<Justificatif[]> {
  const { data } = await createServiceClient()
    .from('inv_justificatifs')
    .select(COLONNES)
    .eq('brand', await activeBrandId())
    .order('created_at', { ascending: false })
    .limit(300)
  return (data ?? []) as unknown as Justificatif[]
}
