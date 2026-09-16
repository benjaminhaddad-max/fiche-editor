'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { notifyMissionRejected, notifyReadyToInvoice } from '@/lib/email/notify'
import { createServerSupabase } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { managerCanEdit } from '@/lib/cycle'
import { round2 } from '@/lib/format'

/**
 * Valide une prestation.
 *  - manager : submitted -> manager_approved
 *  - admin           : submitted | manager_approved -> approved
 *
 * L'admin qui valide une prestation encore au stade "manager" coche
 * les deux etapes d'un coup : c'est le raccourci assume pour les missions
 * qu'il a lui-meme commandees.
 */
export async function approveMission(formData: FormData): Promise<void> {
  const ids = formData.getAll('mission_id').map(String).filter(Boolean)
  await approveMissions(ids)
  revalidatePath('/validation')
  revalidatePath('/admin')
  revalidatePath('/admin/prestations')
}

/**
 * Valide une ou plusieurs prestations.
 *
 * Le mail « vos prestations sont validées » n'est envoyé qu'UNE fois par
 * prestataire à la fin, même si dix de ses lignes sont validées d'un coup :
 * dix mails identiques en dix secondes seraient pris pour du spam.
 */
async function approveMissions(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const user = await requireRole('manager', 'admin')
  const supabase = await createServerSupabase()
  const now = new Date().toISOString()
  const prestatairesAPrevenir = new Set<string>()

  for (const id of ids) {
    await approveOne(id, user, supabase, now, prestatairesAPrevenir)
  }

  for (const providerId of prestatairesAPrevenir) {
    await notifyReadyToInvoice(providerId)
  }
}

async function approveOne(
  id: string,
  user: { id: string; role: string },
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  now: string,
  aPrevenir: Set<string>
): Promise<void> {

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
    return
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
    // Raccourci admin : on renseigne aussi l'etape manager si elle
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

    // La prestation devient facturable : le prestataire doit le savoir,
    // mais on regroupe l'envoi en fin de lot.
    aPrevenir.add(mission.provider_id)
  }
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

/**
 * Corrige une prestation pendant la vérification : libellé, quantité, prix.
 * Le manager ne touche qu'à ses propres lignes et jusqu'à la fin du mois ;
 * l'administrateur, à tout ce qui n'est pas encore facturé.
 */
export async function corrigerMission(formData: FormData): Promise<void> {
  const user = await requireRole('manager', 'admin')
  const id = String(formData.get('mission_id') ?? '')
  const detail = String(formData.get('detail') ?? '').trim()
  const quantity = Number(formData.get('quantity'))
  const unit = Number(formData.get('unit_amount_ht'))
  if (!id || detail.length < 3 || !(quantity > 0) || !(unit >= 0)) return

  const db = createServiceClient()
  const { data: m } = await db
    .from('inv_missions')
    .select('id, manager_id, status, start_date, detail, quantity, unit_amount_ht, total_ht, invoice_id')
    .eq('id', id)
    .maybeSingle()
  if (!m || m.invoice_id) return
  if (!['submitted', 'manager_approved', 'approved'].includes(m.status)) return
  if (user.role === 'manager' && (m.manager_id !== user.id || !managerCanEdit(m.start_date))) return

  const total = round2(quantity * unit)
  await db
    .from('inv_missions')
    .update({ detail, quantity, unit_amount_ht: unit, total_ht: total })
    .eq('id', id)

  await logAudit(null, {
    actorId: user.id,
    entityType: 'mission',
    entityId: id,
    action: 'correction',
    payload: {
      avant: { detail: m.detail, quantity: Number(m.quantity), unit_amount_ht: Number(m.unit_amount_ht), total_ht: Number(m.total_ht) },
      apres: { detail, quantity, unit_amount_ht: unit, total_ht: total },
    },
  })

  revalidatePath('/validation')
}
