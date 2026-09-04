import { NextResponse } from 'next/server'
import { consumeInvitation, exchangeInvitation } from '@/lib/invitation'

/**
 * Échange un jeton d'invitation contre un jeton Supabase de courte durée.
 * Appelé par la page /bienvenue une fois la session en cours fermée.
 */
export async function POST(request: Request) {
  const { token, action } = (await request.json().catch(() => ({}))) as {
    token?: string
    action?: string
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
