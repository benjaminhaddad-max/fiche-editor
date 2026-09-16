import { createClient } from '@/lib/supabase/client'
import type { SessionSwitch } from '@/app/(app)/admin/utilisateurs/actions'

/**
 * Change de session dans le navigateur, puis recharge entièrement.
 *
 * Ordre imposé : on ferme la session en cours (portée locale, pour ne pas
 * déconnecter la personne sur ses autres appareils), on ouvre la nouvelle,
 * et seulement ensuite on navigue. Le rechargement complet garantit que le
 * serveur lit les nouveaux cookies.
 */
export async function switchSession(prep: SessionSwitch): Promise<string | null> {
  if (prep.error) return prep.error

  const supabase = createClient()
  await supabase.auth.signOut({ scope: 'local' })

  if (!prep.tokenHash) {
    if (prep.refus) console.warn('[retour admin refusé]', prep.refus)
    window.location.assign('/login')
    return null
  }

  const { error } = await supabase.auth.verifyOtp({
    token_hash: prep.tokenHash,
    type: 'magiclink',
  })
  if (error) {
    console.warn('[échange de session]', error.message)
    window.location.assign('/login')
    return null
  }

  window.location.assign(prep.destination ?? '/')
  return null
}
