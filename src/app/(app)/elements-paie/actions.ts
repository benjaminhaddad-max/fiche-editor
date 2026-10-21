'use server'

import { createHash } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireProvider } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { activeCycle, cycleForMonth } from '@/lib/cycle'
import { INVOICE_BUCKET } from '@/lib/invoice/store'
import { createServiceClient } from '@/lib/supabase/service'

export interface ElementsResult {
  error?: string
  success?: string
}

const Schema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/),
  overtime_hours: z.coerce.number<number>().min(0).max(300),
  paid_leave_days: z.coerce.number<number>().min(0).max(31),
  unpaid_leave_days: z.coerce.number<number>().min(0).max(31),
  leave_detail: z.string().trim().max(500).optional(),
  sick_leave_days: z.coerce.number<number>().min(0).max(31),
  sick_leave_detail: z.string().trim().max(500).optional(),
  transport: z.enum(['oui', 'non']),
  transport_amount: z.union([z.coerce.number<number>().min(0).max(1000), z.literal('')]).optional(),
  mutuelle: z.enum(['adherent', 'refus']),
  comment: z.string().trim().max(1000).optional(),
})

const MAX_PDF = 6 * 1024 * 1024

/**
 * Le salarié déclare ses éléments du mois : heures supplémentaires, congés,
 * transport, mutuelle. C'est ce qui remplace le mail mensuel du service paie.
 */
export async function enregistrerElements(_prev: ElementsResult, fd: FormData): Promise<ElementsResult> {
  const { user, provider } = await requireProvider()
  const parsed = Schema.safeParse(Object.fromEntries(fd))
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const v = parsed.data

  // On ne déclare que le mois en cours ou celui qui n'est pas encore clos.
  const ouverts = [activeCycle().month, cycleForMonth(activeCycle().month).month, new Date().toISOString().slice(0, 7)]
  if (!ouverts.includes(v.period)) return { error: 'Ce mois n’est plus ouvert à la déclaration.' }

  const db = createServiceClient()

  /** Range une pièce jointe et renvoie son identifiant, ou une erreur. */
  async function deposer(champ: string, dossier: string, intitule: string) {
    const fichier = fd.get(champ)
    if (!(fichier instanceof File) || fichier.size === 0) return { id: null as string | null }
    if (fichier.size > MAX_PDF) return { erreur: `${intitule} : le fichier ne doit pas dépasser 6 Mo.` }
    const contenu = Buffer.from(await fichier.arrayBuffer())
    const extension = fichier.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'jpg'
    const chemin = `${provider.id}/${dossier}/${v.period}.${extension}`
    const { error } = await db.storage.from(INVOICE_BUCKET).upload(chemin, contenu, {
      contentType: extension === 'pdf' ? 'application/pdf' : fichier.type || 'image/jpeg',
      upsert: true,
    })
    if (error) return { erreur: `Dépôt impossible : ${error.message}` }
    const { data: doc } = await db
      .from('inv_documents')
      .insert({
        provider_id: provider.id,
        kind: 'autre',
        period: v.period,
        label: `${intitule} — ${v.period}`,
        path: chemin,
        filename: fichier.name,
        source: 'upload',
        uploaded_by: user.id,
        file_hash: createHash('sha256').update(contenu).digest('hex'),
      })
      .select('id')
      .single()
    return { id: doc?.id ?? null }
  }

  const transportDoc = await deposer('justificatif', 'transport', 'Justificatif de transport')
  if (transportDoc.erreur) return { error: transportDoc.erreur }
  const arretDoc = await deposer('arret', 'arret-travail', 'Arrêt de travail')
  if (arretDoc.erreur) return { error: arretDoc.erreur }
  const documentId = transportDoc.id

  const { error } = await db.from('inv_payroll_inputs').upsert(
    {
      provider_id: provider.id,
      period: v.period,
      overtime_hours: v.overtime_hours,
      paid_leave_days: v.paid_leave_days,
      unpaid_leave_days: v.unpaid_leave_days,
      leave_detail: v.leave_detail || null,
      sick_leave_days: v.sick_leave_days,
      sick_leave_detail: v.sick_leave_detail || null,
      ...(arretDoc.id ? { sick_leave_document: arretDoc.id } : {}),
      transport: v.transport === 'oui',
      transport_amount: v.transport_amount === '' || v.transport_amount === undefined ? null : Number(v.transport_amount),
      ...(documentId ? { transport_document: documentId } : {}),
      mutuelle: v.mutuelle,
      comment: v.comment || null,
      submitted_at: new Date().toISOString(),
      submitted_by: user.id,
    },
    { onConflict: 'provider_id,period' }
  )
  if (error) return { error: `Enregistrement impossible : ${error.message}` }

  await logAudit(null, {
    actorId: user.id,
    entityType: 'provider',
    entityId: provider.id,
    action: 'elements_paie',
    payload: { periode: v.period, heures_sup: v.overtime_hours },
  })

  revalidatePath('/elements-paie')
  revalidatePath('/paie-du-mois')
  return { success: 'Merci, vos éléments sont enregistrés. Vous pouvez encore les corriger jusqu’à la clôture.' }
}
