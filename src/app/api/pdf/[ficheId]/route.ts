import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { generatePdf } from '@/lib/pdf/generate'

export const maxDuration = 60

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ ficheId: string }> }
) {
  const { ficheId } = await params

  // Auth check
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
  }

  // Fetch fiche
  const service = createServiceClient()
  const { data: fiche, error } = await service
    .from('fiches')
    .select('*')
    .eq('id', ficheId)
    .single()

  if (error || !fiche) {
    return NextResponse.json({ error: 'Fiche non trouvee' }, { status: 404 })
  }

  try {
    const pdfBuffer = await generatePdf(fiche)

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="fiche-${fiche.numero}-${fiche.matiere}.pdf"`,
      },
    })
  } catch (err) {
    console.error('PDF generation error:', err)
    return NextResponse.json(
      { error: 'Erreur lors de la generation du PDF' },
      { status: 500 }
    )
  }
}
