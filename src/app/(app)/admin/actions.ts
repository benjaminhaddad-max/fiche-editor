'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireRole } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { createServerSupabase } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

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

  revalidatePath('/admin/utilisateurs')
  revalidatePath('/admin/prestataires')
  return { success: `Compte créé pour ${v.email}.` }
}

export async function toggleUserActive(formData: FormData): Promise<void> {
  const admin = await requireRole('admin')
  const id = String(formData.get('user_id') ?? '')
  const active = formData.get('is_active') === 'true'
  if (!id || id === admin.id) return // on ne se desactive pas soi-meme

  const supabase = await createServerSupabase()
  await supabase.from('inv_users').update({ is_active: !active }).eq('id', id)

  revalidatePath('/admin/utilisateurs')
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

  revalidatePath('/admin/prestataires')
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
