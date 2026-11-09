import { createHash } from 'node:crypto'
import { INVOICE_BUCKET } from '@/lib/invoice/store'
import { createServiceClient } from '@/lib/supabase/service'

const MAX = 4 * 1024 * 1024

/**
 * Range un justificatif (Navigo, arrêt, mutuelle) et renvoie son
 * identifiant. Un fichier vide n'est pas une erreur : on garde l'ancien.
 */
export async function deposerPiece(p: {
  fichier: FormDataEntryValue | null
  providerId: string
  userId: string
  period: string
  dossier: string
  intitule: string
}): Promise<{ id: string | null } | { erreur: string }> {
  const f = p.fichier
  if (!(f instanceof File) || f.size === 0) return { id: null }
  if (f.size > MAX) return { erreur: `${p.intitule} : le fichier ne doit pas dépasser 4 Mo.` }
  const nom = f.name.toLowerCase()
  const pdf = nom.endsWith('.pdf') || f.type === 'application/pdf'
  if (!pdf && !f.type.startsWith('image/')) return { erreur: `${p.intitule} : un PDF ou une photo, s’il vous plaît.` }
  const contenu = Buffer.from(await f.arrayBuffer())
  const extension = pdf ? 'pdf' : nom.endsWith('.png') ? 'png' : 'jpg'
  const empreinte = createHash('sha256').update(contenu).digest('hex')
  const chemin = `${p.providerId}/${p.dossier}/${p.period}-${empreinte.slice(0, 8)}.${extension}`
  const db = createServiceClient()
  const { error } = await db.storage.from(INVOICE_BUCKET).upload(chemin, contenu, {
    contentType: pdf ? 'application/pdf' : f.type || 'image/jpeg',
    upsert: true,
  })
  if (error) return { erreur: `Dépôt impossible : ${error.message}` }
  const { data: doc, error: e2 } = await db
    .from('inv_documents')
    .insert({
      provider_id: p.providerId,
      kind: 'autre',
      period: p.period,
      label: `${p.intitule} — ${p.period}`,
      path: chemin,
      filename: f.name,
      source: 'upload',
      uploaded_by: p.userId,
      file_hash: empreinte,
    })
    .select('id')
    .single()
  if (e2 || !doc) return { erreur: `Dépôt impossible : ${e2?.message}` }
  return { id: doc.id as string }
}

export const typeDuFichier = (chemin: string) =>
  chemin.endsWith('.pdf') ? 'application/pdf' : chemin.endsWith('.png') ? 'image/png' : 'image/jpeg'
