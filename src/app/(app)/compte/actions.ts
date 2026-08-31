'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUser } from '@/lib/auth'
import { createServerSupabase } from '@/lib/supabase/server'

export interface AccountResult {
  error?: string
  success?: string
  fieldErrors?: Record<string, string>
}

const PasswordSchema = z
  .object({
    password: z
      .string()
      .min(10, 'Le mot de passe doit faire au moins 10 caractères.')
      .max(200),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: 'Les deux mots de passe ne correspondent pas.',
    path: ['confirm'],
  })

/** Chaque utilisateur change son propre mot de passe, quel que soit son rôle. */
export async function changePassword(
  _prev: AccountResult,
  formData: FormData
): Promise<AccountResult> {
  await requireUser()

  const parsed = PasswordSchema.safeParse({
    password: formData.get('password'),
    confirm: formData.get('confirm'),
  })
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '_')
      fieldErrors[key] ??= issue.message
    }
    return { fieldErrors }
  }

  const supabase = await createServerSupabase()
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })

  if (error) {
    // Supabase refuse notamment un mot de passe identique au précédent.
    return { error: `Changement impossible : ${error.message}` }
  }

  return { success: 'Mot de passe modifié.' }
}

const NameSchema = z.object({
  full_name: z.string().trim().min(2, 'Nom obligatoire.').max(120),
})

export async function updateOwnName(
  _prev: AccountResult,
  formData: FormData
): Promise<AccountResult> {
  const user = await requireUser()

  const parsed = NameSchema.safeParse({ full_name: formData.get('full_name') })
  if (!parsed.success) {
    return { fieldErrors: { full_name: parsed.error.issues[0].message } }
  }

  const supabase = await createServerSupabase()
  const { error } = await supabase
    .from('inv_users')
    .update({ full_name: parsed.data.full_name })
    .eq('id', user.id)

  if (error) return { error: `Enregistrement impossible : ${error.message}` }

  revalidatePath('/compte')
  return { success: 'Nom mis à jour.' }
}
