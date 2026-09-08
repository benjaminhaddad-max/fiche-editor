import { NextResponse } from 'next/server'
import { consumeInvitation, exchangeInvitation } from '@/lib/invitation'
import { renewAccess } from '@/lib/email/notify'

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
    // La réponse est volontairement identique que l'adresse existe ou non.
    await renewAccess(email ?? '')
    return NextResponse.json({ ok: true })
  }

  if (!token) return NextResponse.json({ error: 'Lien invalide.' }, { status: 400 })

  if (action === 'consume') {
    await consumeInvitation(token)
    return NextResponse.json({ ok: true })
  }

  const result = await exchangeInvitation(token)
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 })

  return NextResponse.json({ hashedToken: result.hashedToken, email: result.email })
}
