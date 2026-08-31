'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { notifyMissionRejected, notifyReadyToInvoice } from '@/lib/email/notify'
import { createServerSupabase } from '@/lib/supabase/server'

/**
 * Valide une prestation.
 *  - donneur d'ordre : submitted -> manager_approved
 *  - admin           : submitted | manager_approved -> approved
 *
 * L'admin qui valide une prestation encore au stade "donneur d'ordre" coche
 * les deux etapes d'un coup : c'est le raccourci assume pour les missions
 * qu'il a lui-meme commandees.
 */
export async function approveMission(formData: FormData): Promise<void> {
  const user = await requireRole('manager', 'admin')
  const id = String(formData.get('mission_id') ?? '')
  if (!id) return

  const supabase = await createServerSupabase()
  const now = new Date().toISOString()

  if (user.role === 'manager') {
    const { error } = await supabase
      .from('inv_missions')
      .update({
        status: 'manager_approved',
        manager_approved_at: now,
        manager_approved_by: user.id,
        rejection_reason: null,
        rejected_at: null,
        rejected_by: null,
      })
      .eq('id', id)
      .eq('manager_id', user.id)
      .eq('status', 'submitted')

    if (error) {
      console.error('[approveMission:manager]', error.message)
      return
    }
    await logAudit(supabase, {
      actorId: user.id,
      entityType: 'mission',
      entityId: id,
      action: 'manager_approve',
    })
  } else {
    const { data: mission } = await supabase
      .from('inv_missions')
      .select('status, manager_approved_at, provider_id')
      .eq('id', id)
      .maybeSingle()

    if (!mission || !['submitted', 'manager_approved'].includes(mission.status)) return

    const patch: Record<string, unknown> = {
      status: 'approved',
      admin_approved_at: now,
      admin_approved_by: user.id,
      rejection_reason: null,
      rejected_at: null,
      rejected_by: null,
    }
    // Raccourci admin : on renseigne aussi l'etape donneur d'ordre si elle
    // n'a jamais eu lieu, pour garder une piste d'audit complete.
    if (!mission.manager_approved_at) {
      patch.manager_approved_at = now
      patch.manager_approved_by = user.id
    }

    const { error } = await supabase.from('inv_missions').update(patch).eq('id', id)

    if (error) {
      console.error('[approveMission:admin]', error.message)
      return
    }
    await logAudit(supabase, {
      actorId: user.id,
      entityType: 'mission',
      entityId: id,
      action: 'admin_approve',
      payload: { shortcut: mission.status === 'submitted' },
    })

    // La prestation devient facturable : le prestataire doit le savoir.
    await notifyReadyToInvoice(mission.provider_id)
  }

  revalidatePath('/validation')
  revalidatePath('/admin')
}

/** Refuse une prestation. Le motif est obligatoire : le prestataire doit
 *  savoir quoi corriger avant de la renvoyer. */
export async function rejectMission(formData: FormData): Promise<void> {
  const user = await requireRole('manager', 'admin')
  const id = String(formData.get('mission_id') ?? '')
  const reason = String(formData.get('rejection_reason') ?? '').trim()
  if (!id || reason.length < 3) return

  const supabase = await createServerSupabase()
  let query = supabase
    .from('inv_missions')
    .update({
      status: 'rejected',
      rejected_at: new Date().toISOString(),
      rejected_by: user.id,
      rejection_reason: reason,
    })
    .eq('id', id)

  if (user.role === 'manager') {
    query = query.eq('manager_id', user.id).eq('status', 'submitted')
  } else {
    query = query.in('status', ['submitted', 'manager_approved'])
  }

  const { error } = await query
  if (error) {
    console.error('[rejectMission]', error.message)
    return
  }

  await logAudit(supabase, {
    actorId: user.id,
    entityType: 'mission',
    entityId: id,
    action: 'reject',
    payload: { reason },
  })

  await notifyMissionRejected(id)

  revalidatePath('/validation')
  revalidatePath('/admin')
}
