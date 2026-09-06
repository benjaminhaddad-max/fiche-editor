'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { notifyStatementCleared, notifyStatementReminder } from '@/lib/email/notify'
import { createServerSupabase } from '@/lib/supabase/server'

export interface ArbitrageResult {
  error?: string
  success?: string
}

/**
 * Clôt un bordereau après arbitrage : le prestataire reçoit le feu vert,
 * avec le montant arrêté et la date à laquelle sa facture est attendue.
 *
 * Le total est recalculé ici, à partir des lignes réellement validées :
 * entre l'envoi du bordereau et son arbitrage, des lignes ont pu être
 * ajoutées, refusées ou corrigées.
 */
export async function cloreBordereau(
  _prev: ArbitrageResult,
  formData: FormData
): Promise<ArbitrageResult> {
  const user = await requireRole('manager', 'admin')
  const id = String(formData.get('statement_id') ?? '')
  const reponse = String(formData.get('reponse') ?? '').trim()
  const dateAttendue = String(formData.get('invoice_expected_at') ?? '').trim()
  if (!id) return { error: 'Bordereau introuvable.' }

  const supabase = await createServerSupabase()

  const { data: lignes } = await supabase
    .from('inv_missions')
    .select('total_ht, status')
    .eq('statement_id', id)
    .eq('status', 'approved')

  const total = (lignes ?? []).reduce((s, l) => s + Number(l.total_ht), 0)

  if (reponse) {
    const { error } = await supabase.from('inv_statement_replies').insert({
      statement_id: id,
      author_id: user.id,
      message: reponse.slice(0, 2000),
    })
    if (error) return { error: `Réponse non enregistrée : ${error.message}` }
  }

  const { data, error } = await supabase
    .from('inv_statements')
    .update({
      status: 'accepted',
      accepted_at: new Date().toISOString(),
      total_ht: total,
      ...(dateAttendue ? { invoice_expected_at: dateAttendue } : {}),
    })
    .eq('id', id)
    .select('id')

  if (error) return { error: `Clôture impossible : ${error.message}` }
  if (!data?.length) return { error: 'Ce bordereau n’est plus modifiable.' }

  await logAudit(supabase, {
    actorId: user.id,
    entityType: 'invoice',
    entityId: id,
    action: 'bordereau_clos',
    payload: { total, reponse: Boolean(reponse) },
  })

  await notifyStatementCleared(id, reponse || null)

  revalidatePath('/validation/bordereaux')
  return { success: 'Bordereau clos. Le prestataire a été prévenu qu’il peut facturer.' }
}

/** Relance un prestataire dont la facture se fait attendre. */
export async function relancer(formData: FormData): Promise<void> {
  const user = await requireRole('manager', 'admin')
  const id = String(formData.get('statement_id') ?? '')
  if (!id) return

  const envoye = await notifyStatementReminder(id)

  const supabase = await createServerSupabase()
  await logAudit(supabase, {
    actorId: user.id,
    entityType: 'invoice',
    entityId: id,
    action: envoye ? 'relance_envoyee' : 'relance_impossible',
  })

  revalidatePath('/validation/bordereaux')
  revalidatePath('/admin/factures')
}
