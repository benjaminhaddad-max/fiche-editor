import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { activeCycle } from '@/lib/cycle'
import { templates } from '@/lib/email/templates'

const PUBLICS = ['prestataire', 'salarie', 'manager'] as const
type Public = (typeof PUBLICS)[number]

/**
 * L'aperçu du message du mois, tel qu'il partira.
 *
 * On n'envoie pas cinquante emails sans avoir relu celui qu'on envoie ;
 * et le texte change selon le statut, donc il faut pouvoir voir les trois.
 */
export async function GET(request: Request, { params }: { params: Promise<{ public: string }> }) {
  await requireRole('admin')
  const { public: pour } = await params
  if (!PUBLICS.includes(pour as Public)) {
    return NextResponse.json({ error: 'Public inconnu.', connus: PUBLICS }, { status: 404 })
  }

  const nom = new URL(request.url).searchParams.get('nom') ?? 'Camille Durand'
  const { html } = templates.monthCalendar({ name: nom, public: pour as Public, cycle: activeCycle() })
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}
