'use server'

import { brand, portalAccepts, BRANDS, type BrandId } from '@/lib/brand'
import { createServerSupabase } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export type Accueil =
  | { etat: 'ok' }
  | { etat: 'autre-ecole'; ecole: string; adresse: string }
  | { etat: 'ferme' }
  | { etat: 'inconnu' }

/**
 * Ce compte a-t-il sa place sur ce site ?
 *
 * Le mot de passe peut être bon et le compte appartenir à l'autre école :
 * les deux plateformes partagent la même base d'authentification. Sans ce
 * contrôle, la personne se connectait « avec succès », puis toutes les
 * pages la renvoyaient à la connexion — elle tombait sur une page blanche
 * sans jamais savoir pourquoi.
 *
 * On le lui dit, et on la renvoie vers son site.
 */
export async function verifierAcces(): Promise<Accueil> {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { etat: 'inconnu' }

  // Lecture par le service : la personne n'a pas encore le droit de lire sa
  // propre ligne tant qu'on n'a pas établi qu'elle est ici chez elle.
  const { data } = await createServiceClient()
    .from('inv_users')
    .select('is_active, brand')
    .eq('auth_id', user.id)
    .maybeSingle()

  if (!data) return { etat: 'inconnu' }
  if (!data.is_active) return { etat: 'ferme' }
  if (portalAccepts(data.brand as string)) return { etat: 'ok' }

  const autre = BRANDS[(data.brand as BrandId) ?? 'diploma'] ?? brand()
  return { etat: 'autre-ecole', ecole: autre.appTitle, adresse: autre.siteUrl }
}
