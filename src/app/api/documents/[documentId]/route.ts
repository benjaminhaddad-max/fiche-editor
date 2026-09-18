import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { INVOICE_BUCKET } from '@/lib/invoice/store'
import { createServerSupabase } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Sert un document personnel. La sécurité en base décide : chacun ses
 * documents, l'administration tous. Un bulletin de salaire ne doit jamais
 * fuiter vers un manager.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })

  const supabase = await createServerSupabase()
  const { data: doc } = await supabase
    .from('inv_documents')
    .select('id, path, label, filename')
    .eq('id', documentId)
    .maybeSingle()
  if (!doc) return NextResponse.json({ error: 'Document introuvable.' }, { status: 404 })

  const { data } = await createServiceClient().storage.from(INVOICE_BUCKET).download(doc.path)
  if (!data) return NextResponse.json({ error: 'Fichier introuvable.' }, { status: 404 })

  return new NextResponse(new Uint8Array(await data.arrayBuffer()), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${(doc.filename ?? doc.label).replace(/[^\w.-]/g, '_')}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
