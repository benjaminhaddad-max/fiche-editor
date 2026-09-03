'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { homePathFor } from '@/lib/auth'
import { createServerSupabase } from '@/lib/supabase/server'

export interface WelcomeResult {
  error?: string
}

const Schema = z
  .object({
    password: z.string().min(10, 'Le mot de passe doit faire au moins 10 caractères.'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: 'Les deux mots de passe ne correspondent pas.',
    path: ['confirm'],
  })

/**
 * Définit le mot de passe d'un compte fraîchement invité.
 * La session a déjà été ouverte par le lien d'invitation : on se contente
 * ici de poser le mot de passe choisi par la personne.
 */
export async function setPassword(
  _prev: WelcomeResult,
  formData: FormData
): Promise<WelcomeResult> {
  const parsed = Schema.safeParse({
    password: formData.get('password'),
    confirm: formData.get('confirm'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Votre lien d’invitation a expiré. Demandez-en un nouveau.' }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) return { error: `Enregistrement impossible : ${error.message}` }

  const { data: profil } = await supabase
    .from('inv_users')
    .select('role')
    .eq('auth_id', user.id)
    .maybeSingle()

  redirect(homePathFor(profil?.role ?? 'prestataire'))
}
