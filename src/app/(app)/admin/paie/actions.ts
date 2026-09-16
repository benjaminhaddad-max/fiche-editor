'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { round2 } from '@/lib/format'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Marque les éléments d'un mois comme envoyés au social : ils sortent de la
 * liste et ne pourront plus être envoyés deux fois.
 */
export async function cloturerPaie(fd: FormData): Promise<void> {
  const user = await requireRole('admin')
  const mois = String(fd.get('mois') ?? '')
  const ids = fd.getAll('mission_id').map(String).filter(Boolean)
  if (!/^\d{4}-\d{2}$/.test(mois) || !ids.length) return

  const db = createServiceClient()
  const { data: lignes } = await db
    .from('inv_missions')
    .select('id, total_ht')
    .in('id', ids)
    .eq('status', 'approved')
    .is('payroll_batch_id', null)
  if (!lignes?.length) return

  const total = round2(lignes.reduce((s, l) => s + Number(l.total_ht), 0))
  const { data: lot } = await db
    .from('inv_payroll_batches')
    .insert({ cycle_month: mois, total_ht: total, lines: lignes.length, created_by: user.id })
    .select('id')
    .single()
  if (!lot) return

  await db
    .from('inv_missions')
    .update({ payroll_batch_id: lot.id, status: 'invoiced' })
    .in('id', lignes.map((l) => l.id))

  await logAudit(null, {
    actorId: user.id,
    entityType: 'user',
    entityId: lot.id,
    action: 'paie_envoyee',
    payload: { mois, lignes: lignes.length, total },
  })
  revalidatePath('/admin/paie')
}
