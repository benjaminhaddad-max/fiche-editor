'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireProvider } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { round2 } from '@/lib/format'
import { createServerSupabase } from '@/lib/supabase/server'

export interface ActionResult {
  error?: string
  fieldErrors?: Record<string, string>
}

const MissionSchema = z
  .object({
    manager_id: z.uuid('Sélectionnez un donneur d’ordre.'),
    category_id: z.uuid('Sélectionnez une catégorie de mission.'),
    detail: z
      .string()
      .trim()
      .min(5, 'Décrivez la prestation en quelques mots (5 caractères minimum).')
      .max(500, 'Le détail ne doit pas dépasser 500 caractères.'),
    start_date: z.iso.date('Date de début invalide.'),
    end_date: z.union([z.iso.date(), z.literal('')]).optional(),
    pricing_type: z.enum(['forfait_mission', 'forfait_horaire']),
    quantity: z.coerce
      .number<number>()
      .positive('La quantité doit être supérieure à 0.')
      .max(10000, 'Quantité trop élevée.'),
    unit_amount_ht: z.coerce
      .number<number>()
      .nonnegative('Le montant unitaire ne peut pas être négatif.')
      .max(1000000, 'Montant trop élevé.'),
  })
  .refine(
    (v) => !v.end_date || v.end_date >= v.start_date,
    { message: 'La date de fin doit être après la date de début.', path: ['end_date'] }
  )

function parseForm(formData: FormData) {
  return MissionSchema.safeParse({
    manager_id: formData.get('manager_id'),
    category_id: formData.get('category_id'),
    detail: formData.get('detail'),
    start_date: formData.get('start_date'),
    end_date: formData.get('end_date') || undefined,
    pricing_type: formData.get('pricing_type'),
    quantity: formData.get('quantity'),
    unit_amount_ht: formData.get('unit_amount_ht'),
  })
}

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '_')
    out[key] ??= issue.message
  }
  return out
}

/** Cree une prestation, en brouillon ou directement soumise a validation. */
export async function createMission(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const { user, provider } = await requireProvider()
  const parsed = parseForm(formData)
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) }

  const submit = formData.get('intent') === 'submit'
  const v = parsed.data
  // Le total est toujours recalcule cote serveur : le champ affiche dans le
  // formulaire n'est qu'une aide a la saisie.
  const total = round2(v.quantity * v.unit_amount_ht)

  const supabase = await createServerSupabase()
  const { data, error } = await supabase
    .from('inv_missions')
    .insert({
      provider_id: provider.id,
      manager_id: v.manager_id,
      category_id: v.category_id,
      detail: v.detail,
      start_date: v.start_date,
      end_date: v.end_date || null,
      pricing_type: v.pricing_type,
      quantity: v.quantity,
      unit_amount_ht: v.unit_amount_ht,
      total_ht: total,
      status: submit ? 'submitted' : 'draft',
      submitted_at: submit ? new Date().toISOString() : null,
    })
    .select('id')
    .single()

  if (error) return { error: `Enregistrement impossible : ${error.message}` }

  await logAudit(supabase, {
    actorId: user.id,
    entityType: 'mission',
    entityId: data.id,
    action: submit ? 'submit' : 'create_draft',
    payload: { total_ht: total },
  })

  revalidatePath('/missions')
  redirect('/missions')
}

/** Met a jour une prestation encore modifiable (brouillon ou refusee). */
export async function updateMission(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const { user } = await requireProvider()
  const id = String(formData.get('mission_id') ?? '')
  if (!id) return { error: 'Prestation introuvable.' }

  const parsed = parseForm(formData)
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) }

  const submit = formData.get('intent') === 'submit'
  const v = parsed.data
  const total = round2(v.quantity * v.unit_amount_ht)

  const supabase = await createServerSupabase()
  const { error } = await supabase
    .from('inv_missions')
    .update({
      manager_id: v.manager_id,
      category_id: v.category_id,
      detail: v.detail,
      start_date: v.start_date,
      end_date: v.end_date || null,
      pricing_type: v.pricing_type,
      quantity: v.quantity,
      unit_amount_ht: v.unit_amount_ht,
      total_ht: total,
      status: submit ? 'submitted' : 'draft',
      submitted_at: submit ? new Date().toISOString() : null,
      // Une prestation renvoyee en validation repart d'une ardoise propre.
      rejection_reason: null,
      rejected_at: null,
      rejected_by: null,
    })
    .eq('id', id)

  if (error) return { error: `Modification impossible : ${error.message}` }

  await logAudit(supabase, {
    actorId: user.id,
    entityType: 'mission',
    entityId: id,
    action: submit ? 'resubmit' : 'update_draft',
  })

  revalidatePath('/missions')
  redirect('/missions')
}

/** Envoie un brouillon (ou une prestation refusee) en validation. */
export async function submitMission(formData: FormData): Promise<void> {
  const { user } = await requireProvider()
  const id = String(formData.get('mission_id') ?? '')
  if (!id) return

  const supabase = await createServerSupabase()
  const { error } = await supabase
    .from('inv_missions')
    .update({
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      rejection_reason: null,
      rejected_at: null,
      rejected_by: null,
    })
    .eq('id', id)
    .in('status', ['draft', 'rejected'])

  if (!error) {
    await logAudit(supabase, {
      actorId: user.id,
      entityType: 'mission',
      entityId: id,
      action: 'submit',
    })
  }

  revalidatePath('/missions')
}

export async function deleteMission(formData: FormData): Promise<void> {
  await requireProvider()
  const id = String(formData.get('mission_id') ?? '')
  if (!id) return

  const supabase = await createServerSupabase()
  await supabase
    .from('inv_missions')
    .delete()
    .eq('id', id)
    .in('status', ['draft', 'rejected'])

  revalidatePath('/missions')
}
