import { redirect } from 'next/navigation'
import { AutreEcole } from '@/components/auth/AutreEcole'
import { BRANDS, portalAccepts, type BrandId } from '@/lib/brand'
import { getSessionUser, homePathFor } from '@/lib/auth'
import { createServerSupabase } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Le seuil de la plateforme.
 *
 * Le contrôle d'école se fait ici, et non dans le formulaire de connexion :
 * toute entrée passe par cette page — mot de passe, lien d'invitation,
 * session déjà ouverte — alors que l'écran de connexion, lui, ne se revoit
 * pas.
 *
 * Et on affiche le refus plutôt que de rediriger vers la connexion en lui
 * passant un motif : une redirection de plus, et la personne retombait sur
 * un écran blanc sans jamais savoir pourquoi.
 */
export default async function Home() {
  const user = await getSessionUser()
  if (user) redirect(homePathFor(user.role))

  const supabase = await createServerSupabase()
  const {
    data: { user: compte },
  } = await supabase.auth.getUser()
  if (!compte) redirect('/login')

  // Session valide, mais aucun espace ici : c'est peut-être le compte de
  // l'autre école. Le dire change tout pour qui vient de taper le bon mot
  // de passe.
  const { data } = await createServiceClient()
    .from('inv_users')
    .select('brand, is_active')
    .eq('auth_id', compte.id)
    .maybeSingle()

  if (data?.is_active && !portalAccepts(data.brand as string)) {
    const autre = BRANDS[data.brand as BrandId]
    if (autre) return <AutreEcole ecole={autre.appTitle} site={autre.siteUrl} />
  }
  redirect('/login')
}
