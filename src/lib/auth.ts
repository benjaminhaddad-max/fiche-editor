import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { COOKIE_MARQUE, deploymentBrandId, portalAccepts } from '@/lib/brand'
import type { AppUser, Provider, Role } from '@/lib/types'

/**
 * Tous les profils de la personne connectée, ici accessibles.
 *
 * Une même identité peut en porter plusieurs : Meryeme dirige la
 * facturation de Linova et donne des cours pour Diploma. Le cloisonnement
 * se fait ici plutôt qu'à l'écran de connexion — toute page passe par là,
 * alors qu'un lien d'invitation ou une reprise de session ne repassent
 * jamais par le formulaire.
 *
 * Mémorisé le temps d'une requête : la marque active l'interroge à chaque
 * lecture, et sans ce cache une page paierait deux allers-retours par appel.
 */
const profilsDuCompte = cache(async (): Promise<AppUser[]> => {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []
  const { data } = await supabase.from('inv_users').select('*').eq('auth_id', user.id)
  return ((data ?? []) as AppUser[]).filter((p) => p.is_active && portalAccepts(p.brand))
})

/** Le profil actif : celui de l'école regardée. */
export const getSessionUser = cache(async (): Promise<AppUser | null> => {

  const profils = await profilsDuCompte()
  if (!profils.length) return null
  if (profils.length === 1) return profils[0]

  const choisie = (await cookies()).get(COOKIE_MARQUE)?.value
  return (
    profils.find((p) => p.brand === choisie) ??
    profils.find((p) => p.brand === deploymentBrandId()) ??
    profils.find((p) => p.brand === 'all') ??
    profils[0]
  )
})

/** Les écoles où cette personne a un profil actif, ici accessible. */
export async function mesMarques(): Promise<string[]> {
  return [...new Set((await profilsDuCompte()).map((p) => p.brand))]
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
