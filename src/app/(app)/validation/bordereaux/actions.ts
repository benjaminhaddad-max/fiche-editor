'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { envoyerBordereaux } from '@/lib/bordereaux'
import { cycleForMonth } from '@/lib/cycle'
import { notifyStatementReminder } from '@/lib/email/notify'
import { createServiceClient } from '@/lib/supabase/service'

/** Relance un prestataire dont la facture se fait attendre : email et SMS. */
export async function relancer(formData: FormData): Promise<void> {
  const user = await requireRole('manager', 'admin')
  const id = String(formData.get('statement_id') ?? '')
  if (!id) return

  const envoye = await notifyStatementReminder(id)
  await logAudit(null, {
    actorId: user.id,
    entityType: 'invoice',
    entityId: id,
    action: envoye ? 'relance_envoyee' : 'relance_impossible',
  })

  revalidatePath('/validation/bordereaux')
}

/**
 * Envoie les bordereaux d'un mois sans attendre la tâche du 1er : utile pour
 * rattraper un mois, ou pour ajouter des lignes validées après l'envoi.
 */
export async function envoyerMaintenant(formData: FormData): Promise<void> {
  const user = await requireRole('admin')
  const mois = String(formData.get('mois') ?? '')
  if (!/^\d{4}-\d{2}$/.test(mois)) return

  const resultat = await envoyerBordereaux(cycleForMonth(mois), user.id)
  await createServiceClient()
    .from('inv_cycle_events')
    .upsert({ cycle_month: mois, event: 'bordereaux', detail: { ...resultat, manuel: user.id } })
  await logAudit(null, {
    actorId: user.id,
    entityType: 'user',
    entityId: user.id,
    action: 'bordereaux_envoyes',
    payload: { mois, ...resultat },
  })

  revalidatePath('/validation/bordereaux')
}
