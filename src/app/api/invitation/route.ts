import { NextResponse } from 'next/server'
import { consumeInvitation, exchangeInvitation } from '@/lib/invitation'
import { renewAccess } from '@/lib/email/notify'
import { COOKIE_MARQUE, estMarqueServie, normalizeBrandId } from '@/lib/brand'

/**
 * Échange un jeton d'invitation contre un jeton Supabase de courte durée.
 * Appelé par la page /bienvenue une fois la session en cours fermée.
 *
 * Sert aussi au renvoi d'un lien mort, demandé par la personne elle-même :
 * personne ne devrait avoir à écrire à un administrateur pour ça.
 */
export async function POST(request: Request) {
  const { token, action, email } = (await request.json().catch(() => ({}))) as {
    token?: string
    action?: string
    email?: string
  }

  if (action === 'renew') {
    const etat = await renewAccess(email ?? '')
    return NextResponse.json({ ok: etat === 'envoye', etat })
  }

  if (!token) return NextResponse.json({ error: 'Lien invalide.' }, { status: 400 })

  if (action === 'consume') {
    await consumeInvitation(token)
    return NextResponse.json({ ok: true })
  }

  const result = await exchangeInvitation(token)
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 })

  const res = NextResponse.json({ hashedToken: result.hashedToken, email: result.email })
  // Une invitation est faite pour un profil, donc pour une école. Florine,
  // déjà chez Diploma, invitée par Medibox, retombait sur Diploma : le choix
  // de l'école revenait par défaut au déploiement. On la pose d'emblée sur
  // celle qui l'invite. Le cookie n'ouvre aucun droit : il n'est relu que
  // parmi les profils actifs du compte (getSessionUser, activeBrandId).
  const ecole = normalizeBrandId(result.brand)
  if (ecole === result.brand && estMarqueServie(ecole)) {
    res.cookies.set(COOKIE_MARQUE, ecole, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    })
  }
  return res
}
