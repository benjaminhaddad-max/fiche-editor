import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { portalAccepts } from '@/lib/brand'
import type { AppUser, Provider, Role } from '@/lib/types'

/** Utilisateur applicatif courant, ou null si non connecte / desactive. */
export async function getSessionUser(): Promise<AppUser | null> {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('inv_users')
    .select('*')
    .eq('auth_id', user.id)
    .maybeSingle()

  if (!data || !data.is_active) return null

  // Une école ne voit pas l'autre. Le contrôle est ici plutôt qu'au
  // formulaire de connexion : toute page passe par cette fonction, alors
  // qu'un lien d'invitation ou une reprise de session ne repassent jamais
  // par l'écran de connexion.
  if (!portalAccepts((data as { brand?: string }).brand)) return null

  return data as AppUser
}

export async function requireUser(): Promise<AppUser> {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  return user
}

export async function requireRole(...roles: Role[]): Promise<AppUser> {
  const user = await requireUser()
  if (!roles.includes(user.role)) redirect(homePathFor(user.role))
  return user
}

/** Prestataire + son profil de facturation. */
export async function requireProvider(): Promise<{ user: AppUser; provider: Provider }> {
  const user = await requireUser()
  if (user.role !== 'prestataire') redirect(homePathFor(user.role))

  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('inv_providers')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  // Un compte prestataire sans fiche de facturation ne peut rien declarer :
  // c'est l'admin qui doit la creer.
  if (!data) redirect('/profil-incomplet')

  return { user, provider: data as Provider }
}

export function homePathFor(role: Role): string {
  switch (role) {
    case 'admin':
      return '/validation'
    case 'manager':
      return '/validation'
    default:
      return '/missions'
  }
}
