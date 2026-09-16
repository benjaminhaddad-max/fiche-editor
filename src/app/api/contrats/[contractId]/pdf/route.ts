import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { INVOICE_BUCKET } from '@/lib/invoice/store'
import { createServerSupabase } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Sert le contrat signé. La sécurité en base décide de l'accès : un
 * prestataire ne lit que ses propres contrats, l'équipe les lit tous.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ contractId: string }> }) {
  const { contractId } = await params
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })

  const supabase = await createServerSupabase()
  const { data: contrat } = await supabase
    .from('inv_coaching_contracts')
    .select('id, document_path')
    .eq('id', contractId)
    .maybeSingle()
  if (!contrat?.document_path) return NextResponse.json({ error: 'Contrat introuvable.' }, { status: 404 })

  const { data } = await createServiceClient().storage.from(INVOICE_BUCKET).download(contrat.document_path)
  if (!data) return NextResponse.json({ error: 'Document introuvable.' }, { status: 404 })

  return new NextResponse(new Uint8Array(await data.arrayBuffer()), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="contrat-${contractId.slice(0, 8)}.pdf"`,
      'Cache-Control': 'private, max-age=60',
    },
  })
}
