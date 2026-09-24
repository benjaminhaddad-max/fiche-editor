import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { activeCycle } from '@/lib/cycle'
import { guideNom, guidePdf, type PublicGuide } from '@/lib/guides/pdf'

const PUBLICS: PublicGuide[] = ['prestataire', 'salarie', 'manager']

/**
 * Le mode d'emploi, à la demande.
 *
 * Il part aussi en pièce jointe des emails du mois, mais quelqu'un qui l'a
 * perdu doit pouvoir le retrouver depuis la plateforme sans redemander.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ pour: string }> }) {
  await requireUser()
  const { pour } = await params
  if (!PUBLICS.includes(pour as PublicGuide)) {
    return NextResponse.json({ error: 'Guide inconnu.' }, { status: 404 })
  }

  const pdf = await guidePdf(pour as PublicGuide, activeCycle())
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${guideNom(pour as PublicGuide)}"`,
      'Cache-Control': 'private, max-age=300',
    },
  })
}
