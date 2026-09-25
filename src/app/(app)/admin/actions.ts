'use server'

import { revalidatePath } from 'next/cache'
import { templates } from '@/lib/email/templates'
import { deliver } from '@/lib/email/notify'
import { ibanValide, normaliserIban } from '@/lib/iban'
import { z } from 'zod'
import { requireRole } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { createServerSupabase } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { EMPLOYMENTS } from '@/lib/types'

export interface AdminResult {
  error?: string
  success?: string
  fieldErrors?: Record<string, string>
}

function toFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '_')
    out[key] ??= issue.message
  }
  return out
}

// ============================================================
// UTILISATEURS
// ============================================================

const NewUserSchema = z.object({
  email: z.email('Email invalide.').transform((v) => v.trim().toLowerCase()),
  full_name: z.string().trim().min(2, 'Nom obligatoire.'),
  role: z.enum(['prestataire', 'manager', 'admin']),
  password: z.string().min(8, 'Le mot de passe doit faire au moins 8 caractères.'),
  legal_name: z.string().trim().optional(),
  employment_type: z.enum(EMPLOYMENTS as [string, ...string[]]).default('independant'),
  phone: z.string().trim().max(30).optional(),
})

/**
 * Cree un compte : utilisateur Supabase Auth + ligne applicative, et la fiche
 * de facturation si c'est un prestataire. Le mot de passe est provisoire, le
 * prestataire le changera a sa premiere connexion.
 */
export async function createUserAccount(
  _prev: AdminResult,
  formData: FormData
): Promise<AdminResult> {
  const admin = await requireRole('admin')

  const parsed = NewUserSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }
  const v = parsed.data

  if (v.role === 'prestataire' && !v.legal_name?.trim()) {
    return { fieldErrors: { legal_name: 'Raison sociale obligatoire pour un prestataire.' } }
  }

  const service = createServiceClient()

  const { data: created, error: authError } = await service.auth.admin.createUser({
    email: v.email,
    password: v.password,
    email_confirm: true,
  })

  if (authError || !created.user) {
    return { error: `Création du compte impossible : ${authError?.message ?? 'erreur inconnue'}` }
  }

  const { data: appUser, error: userError } = await service
    .from('inv_users')
    .insert({
      auth_id: created.user.id,
      email: v.email,
      full_name: v.full_name,
      role: v.role,
      phone: v.phone || null,
    })
    .select('id')
    .single()

  if (userError || !appUser) {
    // On ne laisse pas un compte Auth orphelin derriere nous.
    await service.auth.admin.deleteUser(created.user.id)
    return { error: `Création du profil impossible : ${userError?.message}` }
  }

  if (v.role === 'prestataire') {
    const { error: providerError } = await service.from('inv_providers').insert({
      user_id: appUser.id,
      legal_name: v.legal_name!.trim(),
      invoice_prefix: 'FACT',
      employment_type: v.employment_type,
      phone: v.phone || null,
    })
    if (providerError) {
      return {
        error: `Compte créé, mais la fiche de facturation a échoué : ${providerError.message}`,
      }
    }
  }

  const supabase = await createServerSupabase()
  await logAudit(supabase, {
    actorId: admin.id,
    entityType: 'user',
    entityId: appUser.id,
    action: 'create_account',
    payload: { role: v.role, email: v.email },
  })

  revalidatePath('/admin/equipe')
  return { success: `Compte créé pour ${v.email}.` }
}

export async function toggleUserActive(formData: FormData): Promise<void> {
  const admin = await requireRole('admin')
  const id = String(formData.get('user_id') ?? '')
  const active = formData.get('is_active') === 'true'
  if (!id || id === admin.id) return // on ne se desactive pas soi-meme

  const supabase = await createServerSupabase()
  await supabase.from('inv_users').update({ is_active: !active }).eq('id', id)

  revalidatePath('/admin/equipe')
}

// ============================================================
// PRESTATAIRES (champs pilotes par l'admin)
// ============================================================

const ProviderAdminSchema = z.object({
  provider_id: z.uuid(),
  invoice_prefix: z
    .string()
    .trim()
    .regex(/^[A-Z0-9-]{2,10}$/, 'Préfixe : 2 à 10 caractères, majuscules et chiffres.'),
  payment_terms_days: z.coerce.number<number>().int().min(0).max(120),
  pennylane_supplier_id: z
    .union([z.coerce.number<number>().int().positive(), z.literal('')])
    .transform((v) => (v === '' ? null : v)),
  default_manager_id: z.union([z.uuid(), z.literal('')]).transform((v) => v || null),
  employment_type: z.enum(EMPLOYMENTS as [string, ...string[]]),
  phone: z.string().trim().max(30).optional(),
  notes: z.string().trim().max(2000).optional(),
})

export async function updateProviderAdmin(
  _prev: AdminResult,
  formData: FormData
): Promise<AdminResult> {
  const admin = await requireRole('admin')

  const parsed = ProviderAdminSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }
  const { provider_id, ...patch } = parsed.data

  const supabase = await createServerSupabase()
  const { error } = await supabase
    .from('inv_providers')
    .update(patch)
    .eq('id', provider_id)

  if (error) return { error: `Enregistrement impossible : ${error.message}` }

  await logAudit(supabase, {
    actorId: admin.id,
    entityType: 'provider',
    entityId: provider_id,
    action: 'admin_update',
  })

  revalidatePath('/admin/equipe')
  revalidatePath(`/admin/prestataires/${provider_id}`)
  return { success: 'Fiche enregistrée.' }
}

// ============================================================
// CATEGORIES DE MISSIONS
// ============================================================

const CategorySchema = z.object({
  id: z.union([z.uuid(), z.literal('')]).optional(),
  name: z.string().trim().min(2, 'Nom obligatoire.'),
  pennylane_label: z.string().trim().optional(),
  provider_label: z.string().trim().optional(),
  pennylane_category_id: z
    .union([z.coerce.number<number>().int().positive(), z.literal('')])
    .transform((v) => (v === '' ? null : v)),
  sort_order: z.coerce.number<number>().int().min(0).max(999),
  pole: z.enum(['coaching', 'professeur', 'referent', 'commercial', 'marketing', 'autres']),
  visible_to_provider: z.coerce.boolean<boolean>(),
  is_active: z.coerce.boolean<boolean>(),
})

export async function saveCategory(
  _prev: AdminResult,
  formData: FormData
): Promise<AdminResult> {
  await requireRole('admin')

  const raw = Object.fromEntries(formData)
  const parsed = CategorySchema.safeParse({
    ...raw,
    visible_to_provider: formData.get('visible_to_provider') === 'on',
    is_active: formData.get('is_active') === 'on',
  })
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

  const { id, ...values } = parsed.data
  const payload = {
    ...values,
    pennylane_label: values.pennylane_label || null,
    provider_label: values.provider_label || null,
  }

  const supabase = await createServerSupabase()
  const { error } = id
    ? await supabase.from('inv_categories').update(payload).eq('id', id)
    : await supabase.from('inv_categories').insert(payload)

  if (error) return { error: `Enregistrement impossible : ${error.message}` }

  revalidatePath('/admin/categories')
  return { success: id ? 'Catégorie mise à jour.' : 'Catégorie créée.' }
}

export async function toggleCategoryVisibility(formData: FormData): Promise<void> {
  await requireRole('admin')
  const id = String(formData.get('category_id') ?? '')
  const field = String(formData.get('field') ?? '')
  const current = formData.get('current') === 'true'
  if (!id || !['visible_to_provider', 'is_active'].includes(field)) return

  const supabase = await createServerSupabase()
  await supabase
    .from('inv_categories')
    .update({ [field]: !current })
    .eq('id', id)

  revalidatePath('/admin/categories')
}

/** Numéro du manager, pour les SMS de la messagerie. */
export async function setUserPhone(formData: FormData): Promise<void> {
  const admin = await requireRole('admin')
  const id = String(formData.get('user_id') ?? '')
  const phone = String(formData.get('phone') ?? '').trim().slice(0, 30) || null
  if (!id) return
  await createServiceClient().from('inv_users').update({ phone }).eq('id', id)
  await logAudit(null, { actorId: admin.id, entityType: 'user', entityId: id, action: 'telephone' })
  revalidatePath('/admin/equipe')
}

/**
 * Pose ou retire une étiquette sur une fiche.
 *
 * Les étiquettes se créent en écrivant : pas de table de référence à tenir
 * à jour, et celle qui ne sert plus disparaît quand on la retire de la
 * dernière fiche.
 */
export async function changerEtiquette(fd: FormData): Promise<void> {
  await requireRole('manager', 'admin')
  const providerId = String(fd.get('provider_id') ?? '')
  const etiquette = String(fd.get('tag') ?? '').trim().slice(0, 40)
  const retirer = fd.get('retirer') === '1'
  if (!providerId || !etiquette) return

  const db = createServiceClient()
  const { data: fiche } = await db.from('inv_providers').select('id, tags').eq('id', providerId).maybeSingle()
  if (!fiche) return

  const actuelles: string[] = fiche.tags ?? []
  const tags = retirer
    ? actuelles.filter((t) => t.toLowerCase() !== etiquette.toLowerCase())
    : actuelles.some((t) => t.toLowerCase() === etiquette.toLowerCase())
      ? actuelles
      : [...actuelles, etiquette]

  await db.from('inv_providers').update({ tags }).eq('id', providerId)
  revalidatePath('/admin/equipe')
}

const Facturation = z.object({
  provider_id: z.uuid(),
  legal_name: z.string().trim().min(2, 'Indiquez le nom ou la raison sociale.').max(160),
  legal_form: z.string().trim().max(60).optional(),
  // « en cours » est prévu par le contrat tant que l'auto-entreprise se crée.
  siret: z
    .string()
    .trim()
    .transform((v) => (/^en\s*cours$/i.test(v) ? 'en cours' : v.replace(/\s+/g, '')))
    .refine(
      (v) => v === '' || v === 'en cours' || /^\d{9}(\d{5})?$/.test(v),
      'Indiquez 14 chiffres (ou 9 pour un SIREN), ou « en cours ».'
    ),
  vat_number: z.string().trim().max(20).optional(),
  address_line1: z.string().trim().max(160).optional(),
  address_line2: z.string().trim().max(160).optional(),
  postal_code: z.string().trim().max(12).optional(),
  city: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(30).optional(),
  iban: z.string().trim().max(40).optional(),
  bic: z.string().trim().max(15).optional(),
})

/**
 * Corrige la fiche de facturation de quelqu'un, depuis l'administration.
 *
 * La personne remplit la sienne, mais il faut pouvoir la dépanner : une
 * faute dans une adresse, un SIRET arrivé par message, une auto-entreprise
 * encore en création qu'on note « en cours ».
 *
 * Les coordonnées bancaires restent à l'administration : changer un IBAN,
 * c'est détourner un virement, et un manager n'a pas à pouvoir le faire.
 */
export async function corrigerFicheFacturation(
  _prev: AdminResult,
  formData: FormData
): Promise<AdminResult> {
  const user = await requireRole('manager', 'admin')
  const parsed = Facturation.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

  const { provider_id, iban, bic, ...reste } = parsed.data
  const patch: Record<string, unknown> = { ...reste }
  if (user.role === 'admin') {
    if (iban !== undefined) {
      const propre = normaliserIban(iban)
      if (propre && !ibanValide(propre)) {
        return { fieldErrors: { iban: 'Cet IBAN ne passe pas le contrôle de clé.' } }
      }
      patch.iban = propre || null
    }
    if (bic !== undefined) patch.bic = bic || null
  }

  const db = createServiceClient()
  const { error } = await db.from('inv_providers').update(patch).eq('id', provider_id)
  if (error) return { error: `Enregistrement impossible : ${error.message}` }

  await logAudit(null, {
    actorId: user.id,
    entityType: 'provider',
    entityId: provider_id,
    action: 'fiche_corrigee',
    payload: { champs: Object.keys(patch) },
  })
  revalidatePath(`/admin/prestataires/${provider_id}`)
  revalidatePath('/admin/equipe')
  return { success: 'Fiche mise à jour.' }
}

/**
 * Corrige l'adresse email de quelqu'un.
 *
 * Elle n'est pas sur la fiche de facturation : c'est l'identifiant de
 * connexion. Une faute de frappe, et la personne ne reçoit jamais rien —
 * il faut donc pouvoir la corriger. Mais changer une adresse, c'est changer
 * qui peut entrer dans le compte : tout lien d'accès en cours est annulé,
 * l'ancienne adresse est prévenue, et le geste est journalisé.
 */
export async function changerEmail(_prev: AdminResult, formData: FormData): Promise<AdminResult> {
  const user = await requireRole('manager', 'admin')
  const providerId = String(formData.get('provider_id') ?? '')
  const nouvel = String(formData.get('email') ?? '').trim().toLowerCase()

  if (!providerId) return { error: 'Fiche introuvable.' }
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(nouvel)) {
    return { fieldErrors: { email: 'Cette adresse n’est pas valide.' } }
  }

  const db = createServiceClient()
  const { data: fiche } = await db
    .from('inv_providers')
    .select('id, legal_name, user:inv_users!inv_providers_user_id_fkey(id, email, auth_id, full_name)')
    .eq('id', providerId)
    .maybeSingle()
  const compte = Array.isArray(fiche?.user) ? fiche?.user[0] : fiche?.user
  if (!compte) return { error: 'Cette fiche n’a pas de compte : il n’y a pas d’adresse à changer.' }
  if (compte.email.toLowerCase() === nouvel) return { success: 'C’est déjà cette adresse.' }

  const { data: pris } = await db.from('inv_users').select('id').ilike('email', nouvel).maybeSingle()
  if (pris) return { fieldErrors: { email: 'Cette adresse est déjà utilisée par un autre compte.' } }

  const { error: eAuth } = await db.auth.admin.updateUserById(compte.auth_id, {
    email: nouvel,
    email_confirm: true,
  })
  if (eAuth) return { error: `Changement impossible : ${eAuth.message}` }

  const { error } = await db.from('inv_users').update({ email: nouvel }).eq('id', compte.id)
  if (error) return { error: `Changement impossible : ${error.message}` }

  // Un lien d'accès parti à l'ancienne adresse ne doit plus ouvrir ce compte.
  await db
    .from('inv_invitations')
    .update({ used_at: new Date().toISOString() })
    .eq('user_id', compte.id)
    .is('used_at', null)

  await deliver({
    to: { email: compte.email, name: compte.full_name },
    ...templates.emailChange({ name: compte.full_name, ancienne: compte.email, nouvelle: nouvel, par: user.full_name }),
    template: 'email_change',
    entityType: 'user',
    entityId: compte.id,
  })

  await logAudit(null, {
    actorId: user.id,
    entityType: 'user',
    entityId: compte.id,
    action: 'email_change',
    payload: { avant: compte.email, apres: nouvel },
  })
  revalidatePath(`/admin/prestataires/${providerId}`)
  revalidatePath('/admin/equipe')

  return {
    success: `Adresse changée en ${nouvel}. L’ancienne a été prévenue, et les liens d’accès en cours sont annulés — renvoyez-lui son accès.`,
  }
}
