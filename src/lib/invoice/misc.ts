import Anthropic from '@anthropic-ai/sdk'
import { INVOICE_BUCKET, uploadedPdfPath } from '@/lib/invoice/store'
import { addDays, round2 } from '@/lib/format'
import { createServiceClient } from '@/lib/supabase/service'

/** Ce qu'on lit sur une facture fournisseur quelconque. */
export interface LectureFournisseur {
  fournisseur: {
    nom: string | null
    siret: string | null
    tva_intracom: string | null
    adresse: string | null
    code_postal: string | null
    ville: string | null
    email: string | null
    iban: string | null
  }
  numero: string | null
  date: string | null
  echeance: string | null
  objet: string | null
  total_ht: number | null
  montant_tva: number | null
  total_ttc: number | null
  taux_tva: number | null
  categorie: string | null
  avertissement: string | null
}

const nullable = (type: string, description: string) => ({ type: [type, 'null'], description })

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    fournisseur: {
      type: 'object',
      additionalProperties: false,
      properties: {
        nom: nullable('string', 'Raison sociale ou nom de l’émetteur de la facture (pas Diploma Santé).'),
        siret: nullable('string', 'SIRET (14 chiffres) ou SIREN (9 chiffres) de l’émetteur, chiffres seulement.'),
        tva_intracom: nullable('string', 'Numéro de TVA intracommunautaire de l’émetteur.'),
        adresse: nullable('string', 'Rue de l’émetteur.'),
        code_postal: nullable('string', 'Code postal de l’émetteur.'),
        ville: nullable('string', 'Ville de l’émetteur.'),
        email: nullable('string', 'Email de l’émetteur.'),
        iban: nullable('string', 'IBAN de l’émetteur.'),
      },
      required: ['nom', 'siret', 'tva_intracom', 'adresse', 'code_postal', 'ville', 'email', 'iban'],
    },
    numero: nullable('string', 'Numéro de la facture.'),
    date: nullable('string', 'Date d’émission au format AAAA-MM-JJ.'),
    echeance: nullable('string', 'Date d’échéance au format AAAA-MM-JJ.'),
    objet: nullable('string', 'Objet de la facture en une ligne.'),
    total_ht: nullable('number', 'Total hors taxes.'),
    montant_tva: nullable('number', 'Montant total de TVA (0 si non applicable).'),
    total_ttc: nullable('number', 'Total toutes taxes comprises, net à payer.'),
    taux_tva: nullable('number', 'Taux de TVA principal en pourcentage (20, 10, 5.5, 0).'),
    categorie: nullable('string', 'La catégorie la plus adaptée, recopiée exactement depuis la liste fournie.'),
    avertissement: nullable('string', 'Une phrase si le document n’est pas une facture, est illisible, ou si les totaux ne se recoupent pas.'),
  },
  required: ['fournisseur', 'numero', 'date', 'echeance', 'objet', 'total_ht', 'montant_tva', 'total_ttc', 'taux_tva', 'categorie', 'avertissement'],
} as const

export async function lireFactureFournisseur(pdf: Buffer, categories: string[]): Promise<LectureFournisseur> {
  const client = new Anthropic()
  const response = await client.messages.create({
    model: 'claude-opus-5',
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdf.toString('base64') } },
          {
            type: 'text',
            text: `Cette facture a été adressée à Diploma Santé, qui en est le CLIENT. Extrais l'identité de l'ÉMETTEUR (le fournisseur) et les montants, tels qu'ils sont écrits, sans rien inventer : un champ absent vaut null.

Catégories comptables possibles (recopie exactement l'une d'elles dans "categorie", ou "Autres") :
${categories.map((c) => `- ${c}`).join('\n')}`,
          },
        ],
      },
    ],
  })
  if (response.stop_reason === 'refusal') throw new Error('La lecture du document a été refusée.')
  const bloc = response.content.find((b) => b.type === 'text')
  if (!bloc || bloc.type !== 'text') throw new Error('Aucun contenu lisible dans la réponse.')
  return JSON.parse(bloc.text) as LectureFournisseur
}

const norm = (s: string | null | undefined) =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** Taux déclaré, ou déduit des montants et ramené au taux légal le plus proche. */
function tauxTva(l: LectureFournisseur): number {
  if (l.taux_tva !== null && [0, 2.1, 5.5, 10, 20].includes(l.taux_tva)) return l.taux_tva
  if (!l.total_ht || !l.montant_tva) return 0
  const brut = (l.montant_tva / l.total_ht) * 100
  return [0, 2.1, 5.5, 10, 20].reduce((a, b) => (Math.abs(b - brut) < Math.abs(a - brut) ? b : a))
}

export interface FactureDiverseResultat {
  ok: boolean
  error?: string
  invoiceId?: string
  fournisseur?: string
  numero?: string
  totalTtc?: number
  fournisseurCree?: boolean
  avertissement?: string | null
}

/**
 * Enregistre une facture fournisseur quelconque, directement « validée » :
 * elle n'attend plus qu'un clic pour partir dans Pennylane.
 *
 * Le fournisseur est retrouvé par SIRET, puis par email, puis par nom ; à
 * défaut, une fiche sans compte est créée à partir de la facture — la
 * personne n'aura pas d'accès à Diploma Invoice.
 */
export async function enregistrerFactureDiverse(input: {
  pdf: Buffer
  filename: string
  submittedBy: string | null
  channel: 'upload' | 'email'
  emailMessageId?: string | null
  categoryId?: string | null
}): Promise<FactureDiverseResultat> {
  const db = createServiceClient()
  const { data: cats } = await db.from('inv_categories').select('id, name, pennylane_category_id').eq('is_active', true)
  const categories = cats ?? []

  let lu: LectureFournisseur
  try {
    lu = await lireFactureFournisseur(input.pdf, categories.map((c) => c.name))
  } catch (err) {
    return { ok: false, error: `Lecture impossible : ${err instanceof Error ? err.message : String(err)}` }
  }

  const nom = lu.fournisseur.nom?.trim()
  const ttc = lu.total_ttc ?? (lu.total_ht !== null ? round2(lu.total_ht + (lu.montant_tva ?? 0)) : null)
  if (!nom || ttc === null) {
    return { ok: false, error: lu.avertissement ?? 'Fournisseur ou montant illisible sur ce document.' }
  }
  const taux = tauxTva(lu)
  const ht = lu.total_ht ?? round2(ttc / (1 + taux / 100))
  const tva = lu.montant_tva ?? round2(ttc - ht)

  // ---- Fournisseur
  const siret = (lu.fournisseur.siret ?? '').replace(/\D/g, '') || null
  const { data: fiches } = await db
    .from('inv_providers')
    .select('id, legal_name, siret, contact_email, user:inv_users!inv_providers_user_id_fkey(email)')
  const liste = (fiches ?? []) as unknown as {
    id: string
    legal_name: string
    siret: string | null
    contact_email: string | null
    user: { email: string } | null
  }[]
  const email = lu.fournisseur.email?.toLowerCase() ?? null
  let fiche =
    (siret && liste.find((f) => (f.siret ?? '').replace(/\D/g, '') === siret)) ||
    (email && liste.find((f) => f.contact_email?.toLowerCase() === email || f.user?.email?.toLowerCase() === email)) ||
    liste.find((f) => norm(f.legal_name) === norm(nom)) ||
    null

  let cree = false
  if (!fiche) {
    const { data: nouvelle, error } = await db
      .from('inv_providers')
      .insert({
        user_id: null,
        legal_name: nom,
        siret,
        vat_number: lu.fournisseur.tva_intracom,
        address_line1: lu.fournisseur.adresse,
        postal_code: lu.fournisseur.code_postal,
        city: lu.fournisseur.ville,
        contact_email: email,
        iban: lu.fournisseur.iban?.replace(/\s+/g, '') ?? null,
        vat_regime: taux > 0 ? 'normal' : 'franchise',
        vat_rate: taux,
        invoice_mode: 'uploaded',
        employment_type: 'independant',
        onboarding_complete: true,
        notes: 'Fournisseur créé automatiquement depuis une facture diverse — pas de compte Diploma Invoice.',
      })
      .select('id, legal_name, siret, contact_email')
      .single()
    if (error || !nouvelle) return { ok: false, error: `Création du fournisseur impossible : ${error?.message}` }
    fiche = { ...nouvelle, user: null }
    cree = true
  }

  // ---- Catégorie
  const categorie =
    categories.find((c) => c.id === input.categoryId) ??
    categories.find((c) => c.name === lu.categorie) ??
    categories.find((c) => c.name === 'Autres') ??
    categories[0]

  // ---- Facture
  const date = lu.date && /^\d{4}-\d{2}-\d{2}$/.test(lu.date) ? lu.date : new Date().toISOString().slice(0, 10)
  const numero = lu.numero?.trim() || `DIV-${date}-${Date.now().toString(36).toUpperCase()}`
  const now = new Date().toISOString()

  const { data: facture, error } = await db
    .from('inv_invoices')
    .insert({
      provider_id: fiche.id,
      number: numero,
      status: 'validated',
      kind: 'misc',
      issue_date: date,
      due_date: lu.echeance && /^\d{4}-\d{2}-\d{2}$/.test(lu.echeance) ? lu.echeance : addDays(date, 30),
      issuer_snapshot: {
        legal_name: nom,
        legal_form: null,
        siret,
        vat_number: lu.fournisseur.tva_intracom,
        address_line1: lu.fournisseur.adresse,
        address_line2: null,
        postal_code: lu.fournisseur.code_postal,
        city: lu.fournisseur.ville,
        country: 'France',
        email: email ?? '',
        phone: null,
        iban: lu.fournisseur.iban,
        bic: null,
        vat_regime: taux > 0 ? 'normal' : 'franchise',
      },
      subtotal_ht: ht,
      vat_rate: taux,
      vat_amount: tva,
      total_ttc: ttc,
      pdf_source: 'uploaded',
      uploaded_filename: input.filename,
      uploaded_at: now,
      issued_at: now,
      sent_at: now,
      validated_at: now,
      validated_by: input.submittedBy,
      submitted_by: input.submittedBy,
      category_id: categorie?.id ?? null,
      description: lu.objet,
      channel: input.channel,
      email_message_id: input.emailMessageId ?? null,
      ai_check: {
        checked_at: now,
        expected_ht: null,
        read_ht: ht,
        read_number: lu.numero,
        matches: null,
        message: lu.avertissement,
      },
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') {
      return { ok: false, error: `La facture ${numero} de ${nom} est déjà enregistrée.` }
    }
    return { ok: false, error: `Enregistrement impossible : ${error.message}` }
  }

  const path = uploadedPdfPath(fiche.id, facture.id)
  const { error: stockage } = await db.storage
    .from(INVOICE_BUCKET)
    .upload(path, input.pdf, { contentType: 'application/pdf', upsert: true })
  if (stockage) {
    await db.from('inv_invoices').delete().eq('id', facture.id)
    return { ok: false, error: `Stockage du PDF impossible : ${stockage.message}` }
  }

  await db.from('inv_invoices').update({ pdf_path: path }).eq('id', facture.id)
  await db.from('inv_invoice_lines').insert({
    invoice_id: facture.id,
    mission_id: null,
    description: lu.objet ?? `Facture ${numero}`,
    category_name: categorie?.name ?? 'Autres',
    pennylane_category_id: categorie?.pennylane_category_id ?? null,
    pricing_type: 'forfait_mission',
    quantity: 1,
    unit_amount_ht: ht,
    total_ht: ht,
    vat_rate: taux,
    vat_amount: tva,
    total_ttc: ttc,
    period_label: null,
    sort_order: 1,
  })

  return {
    ok: true,
    invoiceId: facture.id,
    fournisseur: nom,
    numero,
    totalTtc: ttc,
    fournisseurCree: cree,
    avertissement: lu.avertissement,
  }
}
