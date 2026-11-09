import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { INVOICE_BUCKET } from '@/lib/invoice/store'
import { createServiceClient } from '@/lib/supabase/service'
import { gereLeSocial } from '@/lib/social/parametres'
import { typeDuFichier } from '@/lib/social/pieces'

/**
 * Un justificatif de l'Espace Social (Navigo, arrêt, mutuelle), pour
 * l'aperçu dans la page de validation. Réservé à l'équipe paie, et
 * seulement pour une pièce rattachée à une saisie : ce n'est pas une porte
 * ouverte sur les autres documents (bulletins, contrats).
 */
export async function GET(_r: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params
  if (!/^[0-9a-f-]{36}$/i.test(documentId)) return NextResponse.json({ error: 'introuvable' }, { status: 404 })
  const user = await getSessionUser()
  if (!user || !(await gereLeSocial(user))) return NextResponse.json({ error: 'non autorisé' }, { status: 403 })
  const db = createServiceClient()
  const { data: rattachee } = await db
    .from('inv_payroll_inputs')
    .select('id')
    .or(`transport_document.eq.${documentId},sick_leave_document.eq.${documentId},mutuelle_document.eq.${documentId}`)
    .limit(1)
  if (!rattachee?.length) return NextResponse.json({ error: 'introuvable' }, { status: 404 })
  const { data: doc } = await db.from('inv_documents').select('path, filename, label').eq('id', documentId).maybeSingle()
  if (!doc) return NextResponse.json({ error: 'introuvable' }, { status: 404 })
  const { data } = await db.storage.from(INVOICE_BUCKET).download(doc.path as string)
  if (!data) return NextResponse.json({ error: 'fichier introuvable' }, { status: 404 })
  return new NextResponse(new Uint8Array(await data.arrayBuffer()), {
    headers: {
      'Content-Type': typeDuFichier(String(doc.path)),
      'Content-Disposition': `inline; filename="${String(doc.filename ?? doc.label).replace(/[^\w.-]/g, '_')}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
