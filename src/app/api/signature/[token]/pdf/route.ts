import { NextResponse } from 'next/server'
import { INVOICE_BUCKET } from '@/lib/invoice/store'
import { createServiceClient } from '@/lib/supabase/service'

/** Le contrat à lire avant signature. Le jeton du lien fait l'accès. */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const db = createServiceClient()
  const { data } = await db
    .from('inv_coaching_contracts')
    .select('id, document_path')
    .eq('signature_token', token)
    .maybeSingle()
  if (!data?.document_path) return NextResponse.json({ error: 'Contrat introuvable.' }, { status: 404 })

  const { data: fichier } = await db.storage.from(INVOICE_BUCKET).download(data.document_path)
  if (!fichier) return NextResponse.json({ error: 'Document introuvable.' }, { status: 404 })

  return new NextResponse(new Uint8Array(await fichier.arrayBuffer()), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="contrat-${data.id.slice(0, 8)}.pdf"`,
      'Cache-Control': 'no-store',
    },
  })
}
