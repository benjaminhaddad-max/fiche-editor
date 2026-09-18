'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireRole } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { round2 } from '@/lib/format'
import { createServiceClient } from '@/lib/supabase/service'
import { INVOICE_BUCKET } from '@/lib/invoice/store'
import { POLES } from '@/lib/types'
import { modele } from '@/lib/contracts/modeles'
import type { CorpsContrat } from '@/lib/contracts/modeles'
import { composer, nouveauJeton, rangerPdf } from '@/lib/contracts/signature'
import { trouverOuCreerPrestataire } from '@/lib/personnes'
import { deliver } from '@/lib/email/notify'
import { templates } from '@/lib/email/templates'

export interface ContractResult {
  error?: string
  success?: string
}

const Echeance = z.object({
  label: z.string().trim().min(2),
  due_date: z.iso.date(),
  amount_ht: z.coerce.number<number>().nonnegative(),
})

const Contrat = z
  .object({
    provider_id: z.uuid('Choisissez la personne.'),
    contract_type: z.enum(POLES as [string, ...string[]]),
    title: z.string().trim().min(3, 'Donnez un intitulé au contrat.').max(200),
    manager_id: z.union([z.uuid(), z.literal('')]).optional(),
    start_date: z.iso.date('Date de début invalide.'),
    end_date: z.union([z.iso.date(), z.literal('')]).optional(),
    rate_type: z.enum(['forfait', 'mission', 'horaire', 'mensuel']),
    rate_amount: z.union([z.coerce.number<number>().nonnegative(), z.literal('')]).optional(),
    total_ht: z.union([z.coerce.number<number>().nonnegative(), z.literal('')]).optional(),
    conditions: z.string().trim().max(5000).optional(),
  })
  .refine((v) => !v.end_date || v.end_date >= v.start_date, { message: 'La fin doit suivre le début.', path: ['end_date'] })

/**
 * Crée un contrat de n'importe quel pôle. Un forfait porte un échéancier :
 * ses échéances deviendront des prestations à leur date. Un tarif à la
 * mission, à l'heure ou au mois sert de référence aux déclarations.
 */
export async function creerContrat(_prev: ContractResult, fd: FormData): Promise<ContractResult> {
  const user = await requireRole('admin')
  const parsed = Contrat.safeParse(Object.fromEntries(fd))
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const v = parsed.data

  let echeances: z.infer<typeof Echeance>[] = []
  try {
    const brut = JSON.parse(String(fd.get('echeances') ?? '[]')) as unknown[]
    echeances = brut
      .filter((e) => e && typeof e === 'object' && (e as { amount_ht?: unknown }).amount_ht !== '')
      .map((e) => Echeance.parse(e))
  } catch {
    return { error: 'Échéancier incomplet : chaque ligne demande un libellé, une date et un montant.' }
  }

  const somme = round2(echeances.reduce((s, e) => s + e.amount_ht, 0))
  const total = v.total_ht === '' || v.total_ht === undefined ? somme : Number(v.total_ht)
  if (v.rate_type === 'forfait' && echeances.length && Math.abs(somme - total) > 0.01) {
    return { error: `Les échéances font ${somme} € alors que le contrat en fait ${total} €.` }
  }

  const db = createServiceClient()
  // La catégorie comptable du pôle : les échéances deviendront des
  // prestations de cette catégorie.
  const { data: categorie } = await db
    .from('inv_categories')
    .select('id')
    .eq('pole', v.contract_type)
    .eq('is_active', true)
    .order('sort_order')
    .limit(1)
    .maybeSingle()
  if (v.rate_type === 'forfait' && echeances.length && !v.manager_id) {
    return { error: 'Choisissez le manager référent : les échéances lui seront rattachées.' }
  }

  const { data: contrat, error } = await db
    .from('inv_coaching_contracts')
    .insert({
      provider_id: v.provider_id,
      contract_type: v.contract_type,
      title: v.title,
      manager_id: v.manager_id || null,
      category_id: categorie?.id ?? null,
      start_date: v.start_date,
      end_date: v.end_date || null,
      rate_type: v.rate_type,
      rate_amount: v.rate_amount === '' || v.rate_amount === undefined ? null : Number(v.rate_amount),
      total_ht: total,
      conditions: v.conditions || null,
      status: 'active',
    })
    .select('id')
    .single()
  if (error) return { error: `Création impossible : ${error.message}` }

  if (echeances.length) {
    const { error: e2 } = await db.from('inv_contract_instalments').insert(
      echeances.map((e, i) => ({ contract_id: contrat.id, label: e.label, due_date: e.due_date, amount_ht: e.amount_ht, sort_order: i + 1 }))
    )
    if (e2) return { error: `Contrat créé, mais échéancier non enregistré : ${e2.message}` }
  }

  const fichier = fd.get('file')
  if (fichier instanceof File && fichier.size > 0) {
    const erreur = await rangerDocument(contrat.id, v.provider_id, fichier)
    if (erreur) return { error: `Contrat créé, mais ${erreur.charAt(0).toLowerCase()}${erreur.slice(1)}` }
  }

  await logAudit(null, { actorId: user.id, entityType: 'provider', entityId: contrat.id, action: 'contrat_cree', payload: { total, echeances: echeances.length } })
  revalidatePath('/admin/contrats')
  return { success: 'Contrat enregistré. La personne le retrouve dans « Mes contrats ».' }
}

const MAX_PDF = 4 * 1024 * 1024

/** Range le PDF signé d'un contrat. Renvoie un message d'erreur, ou null. */
async function rangerDocument(contractId: string, providerId: string, fichier: File): Promise<string | null> {
  if (!fichier.name.toLowerCase().endsWith('.pdf') && fichier.type !== 'application/pdf') return 'Le contrat doit être un PDF.'
  if (fichier.size > MAX_PDF) return 'Le PDF ne doit pas dépasser 4 Mo.'
  const db = createServiceClient()
  const path = `${providerId}/contrat-${contractId}.pdf`
  const { error } = await db.storage
    .from(INVOICE_BUCKET)
    .upload(path, Buffer.from(await fichier.arrayBuffer()), { contentType: 'application/pdf', upsert: true })
  if (error) return `Dépôt du PDF impossible : ${error.message}`
  await db.from('inv_coaching_contracts').update({ document_path: path }).eq('id', contractId)
  return null
}

/** Dépose ou remplace le contrat signé. */
export async function deposerDocumentContrat(_prev: ContractResult, fd: FormData): Promise<ContractResult> {
  const user = await requireRole('admin')
  const id = String(fd.get('contract_id') ?? '')
  const fichier = fd.get('file')
  if (!id || !(fichier instanceof File) || fichier.size === 0) return { error: 'Choisissez le PDF du contrat.' }
  const { data: c } = await createServiceClient().from('inv_coaching_contracts').select('provider_id').eq('id', id).maybeSingle()
  if (!c) return { error: 'Contrat introuvable.' }
  const erreur = await rangerDocument(id, c.provider_id, fichier)
  if (erreur) return { error: erreur }
  await logAudit(null, { actorId: user.id, entityType: 'provider', entityId: id, action: 'contrat_document' })
  revalidatePath('/admin/contrats', 'layout')
  return { success: 'Contrat signé enregistré.' }
}

export async function changerStatutContrat(fd: FormData): Promise<void> {
  const user = await requireRole('admin')
  const id = String(fd.get('contract_id') ?? '')
  const statut = String(fd.get('status') ?? '')
  if (!id || !['active', 'ended', 'cancelled'].includes(statut)) return
  await createServiceClient().from('inv_coaching_contracts').update({ status: statut }).eq('id', id)
  await logAudit(null, { actorId: user.id, entityType: 'provider', entityId: id, action: `contrat_${statut}` })
  revalidatePath('/admin/contrats', 'layout')
}

// ============================================================
// MODÈLES, ENVOI ET SIGNATURE
// ============================================================

const DepuisModele = z
  .object({
    profile: z.string().min(2, 'Choisissez un modèle de contrat.'),
    provider_id: z.union([z.uuid(), z.literal('nouveau')]),
    new_name: z.string().trim().max(120).optional(),
    new_email: z.union([z.email('Email invalide.'), z.literal('')]).optional(),
    new_phone: z.string().trim().max(30).optional(),
    manager_id: z.union([z.uuid(), z.literal('')]).optional(),
    start_date: z.iso.date('Date de début invalide.'),
    end_date: z.union([z.iso.date(), z.literal('')]).optional(),
    rate_amount: z.union([z.coerce.number<number>().nonnegative(), z.literal('')]).optional(),
    precisions: z.string().trim().max(3000).optional(),
    envoyer: z.enum(['oui', 'non']).default('oui'),
  })
  .refine((v) => v.provider_id !== 'nouveau' || (v.new_name && v.new_email), {
    message: 'Indiquez le nom et l’email de la personne.',
    path: ['new_name'],
  })

/**
 * Crée un contrat à partir d'un modèle, et l'envoie à signer.
 *
 * Le texte est figé ici : un modèle corrigé plus tard ne changera pas ce
 * contrat. La personne peut ne pas exister encore — son compte est créé au
 * passage, et le lien de signature lui sert aussi de première entrée.
 */
export async function creerDepuisModele(_prev: ContractResult, fd: FormData): Promise<ContractResult> {
  const user = await requireRole('manager', 'admin')
  const parsed = DepuisModele.safeParse(Object.fromEntries(fd))
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const v = parsed.data
  const m = modele(v.profile)
  if (!m) return { error: 'Modèle inconnu.' }

  const db = createServiceClient()
  let providerId = v.provider_id
  let cree = false
  if (v.provider_id === 'nouveau') {
    const r = await trouverOuCreerPrestataire(db, {
      nom: v.new_name!,
      email: v.new_email as string,
      telephone: v.new_phone || null,
      employment: m.employment,
    })
    if ('error' in r) return { error: r.error }
    providerId = r.providerId
    cree = r.cree
  } else {
    await db.from('inv_providers').update({ employment_type: m.employment }).eq('id', providerId)
  }

  const { data: fiche } = await db
    .from('inv_providers')
    .select('id, legal_name, siret, address_line1, postal_code, city, phone, user:inv_users!inv_providers_user_id_fkey(full_name, email, phone)')
    .eq('id', providerId)
    .maybeSingle()
  if (!fiche) return { error: 'Fiche introuvable.' }
  const compte = (fiche as unknown as { user: { full_name: string; email: string; phone: string | null } | null }).user

  const montant = v.rate_amount === '' || v.rate_amount === undefined ? m.rateAmount : Number(v.rate_amount)
  const corps = composer(v.profile, {
    nom: compte?.full_name ?? fiche.legal_name,
    email: compte?.email ?? '',
    telephone: fiche.phone ?? compte?.phone ?? null,
    adresse: [fiche.address_line1, fiche.postal_code, fiche.city].filter(Boolean).join(', ') || null,
    siret: fiche.siret,
    debut: v.start_date,
    fin: v.end_date || null,
    montant,
    precisions: v.precisions || null,
  })
  if (!corps) return { error: 'Modèle inconnu.' }

  const { data: categorie } = await db
    .from('inv_categories')
    .select('id')
    .eq('pole', m.pole)
    .eq('is_active', true)
    .order('sort_order')
    .limit(1)
    .maybeSingle()

  const { data: contrat, error } = await db
    .from('inv_coaching_contracts')
    .insert({
      provider_id: providerId,
      manager_id: v.manager_id || user.id,
      category_id: categorie?.id ?? null,
      contract_type: m.pole,
      profile: m.cle,
      title: corps.intitule,
      start_date: v.start_date,
      end_date: v.end_date || null,
      rate_type: m.rateType,
      rate_amount: montant,
      total_ht: 0,
      monthly_auto: m.monthlyAuto && m.employment === 'independant',
      conditions: [m.resume, v.precisions].filter(Boolean).join('\n\n'),
      body: corps,
      status: 'active',
    })
    .select('id')
    .single()
  if (error) return { error: `Création impossible : ${error.message}` }

  await logAudit(null, {
    actorId: user.id,
    entityType: 'provider',
    entityId: contrat.id,
    action: 'contrat_cree',
    payload: { profil: m.cle, compte_cree: cree },
  })

  if (v.envoyer === 'non' || !m.signable) {
    await rangerPdf(providerId, contrat.id, corps, null)
    revalidatePath('/admin/contrats', 'layout')
    return {
      success: m.signable
        ? 'Contrat enregistré. Vous pourrez l’envoyer à signer quand vous voudrez.'
        : 'Annexe enregistrée. Le contrat de travail (CERFA) se signe en dehors de la plateforme : déposez-le ici une fois signé.',
    }
  }

  const envoi = await envoyerASigner(contrat.id, user.id, user.full_name)
  revalidatePath('/admin/contrats', 'layout')
  return envoi.error ? { error: envoi.error } : { success: envoi.success }
}

/** Envoie (ou renvoie) le contrat à signer. */
async function envoyerASigner(contractId: string, senderId: string, senderName: string): Promise<ContractResult> {
  const db = createServiceClient()
  const { data: c } = await db
    .from('inv_coaching_contracts')
    .select('id, provider_id, title, body, signature_token, signed_at, provider:inv_providers(legal_name, user:inv_users!inv_providers_user_id_fkey(full_name, email))')
    .eq('id', contractId)
    .maybeSingle()
  if (!c) return { error: 'Contrat introuvable.' }
  if (c.signed_at) return { error: 'Ce contrat est déjà signé.' }
  const corps = c.body as CorpsContrat | null
  if (!corps) return { error: 'Ce contrat n’a pas de texte : il a été saisi à la main. Déposez le PDF signé.' }

  const dest = (c as unknown as { provider: { user: { full_name: string; email: string } | null } | null }).provider?.user
  if (!dest?.email) return { error: 'Cette personne n’a pas d’email : complétez sa fiche.' }

  await rangerPdf(c.provider_id, c.id, corps, null)
  const jeton = c.signature_token ?? nouveauJeton()
  await db
    .from('inv_coaching_contracts')
    .update({ signature_token: jeton, sent_at: new Date().toISOString(), sent_by: senderId })
    .eq('id', c.id)

  const app = process.env.NEXT_PUBLIC_APP_URL ?? 'https://facturation.diploma-sante.fr'
  await deliver({
    to: { email: dest.email, name: dest.full_name },
    ...templates.contractToSign({
      name: dest.full_name,
      senderName,
      intitule: corps.intitule,
      resume: corps.resume,
      link: `${app}/signature/${jeton}`,
    }),
    template: 'contract_to_sign',
    entityType: 'provider',
    entityId: c.id,
    providerId: c.provider_id,
  })
  return { success: `Contrat envoyé à ${dest.email}. Vous serez prévenu dès qu’il sera signé.` }
}

/** Bouton « Envoyer à signer » / « Renvoyer le lien ». */
export async function envoyerContrat(fd: FormData): Promise<void> {
  const user = await requireRole('manager', 'admin')
  const id = String(fd.get('contract_id') ?? '')
  if (!id) return
  await envoyerASigner(id, user.id, user.full_name)
  revalidatePath('/admin/contrats', 'layout')
}
