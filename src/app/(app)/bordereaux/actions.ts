'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireProvider } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { round2 } from '@/lib/format'
import { createServerSupabase } from '@/lib/supabase/server'

export interface BordereauResult {
  error?: string
  success?: string
}

/**
 * Le prestataire signale quelque chose sur son bordereau.
 *
 * Le champ est volontairement libre : on ne sait pas d'avance ce qu'il aura
 * à dire, et l'obliger à choisir dans une liste lui ferait taire le reste.
 * Le bordereau passe en « contesté », ce qui le fait remonter aux managers
 * pendant la semaine de vérification.
 */
export async function signaler(
  _prev: BordereauResult,
  formData: FormData
): Promise<BordereauResult> {
  const { user, provider } = await requireProvider()
  const id = String(formData.get('statement_id') ?? '')
  const commentaire = String(formData.get('commentaire') ?? '').trim()

  if (!id) return { error: 'Bordereau introuvable.' }
  if (commentaire.length < 3) return { error: 'Décrivez ce qui pose problème.' }

  const supabase = await createServerSupabase()
  const { data, error } = await supabase
    .from('inv_statements')
    .update({
      provider_comment: commentaire.slice(0, 2000),
      provider_responded_at: new Date().toISOString(),
      status: 'contested',
    })
    .eq('id', id)
    .eq('provider_id', provider.id)
    .select('id')

  if (error) return { error: `Envoi impossible : ${error.message}` }
  if (!data?.length) {
    return { error: 'Ce bordereau n’est plus modifiable. Contactez votre interlocuteur.' }
  }

  await logAudit(supabase, {
    actorId: user.id,
    entityType: 'invoice',
    entityId: id,
    action: 'bordereau_signale',
  })

  revalidatePath(`/bordereaux/${id}`)
  return { success: 'Votre remarque a été transmise. Elle sera examinée cette semaine.' }
}

const AjoutSchema = z.object({
  statement_id: z.uuid(),
  manager_id: z.uuid('Indiquez qui vous a confié cette mission.'),
  category_id: z.uuid('Indiquez le type de prestation.'),
  detail: z.string().trim().min(5, 'Décrivez la prestation.').max(500),
  start_date: z.iso.date('Date invalide.'),
  quantity: z.coerce.number<number>().positive('La quantité doit être supérieure à 0.'),
  unit_amount_ht: z.coerce.number<number>().nonnegative('Montant invalide.'),
})

/** Le prestataire ajoute une prestation oubliée, depuis son bordereau. */
export async function ajouterAuBordereau(
  _prev: BordereauResult,
  formData: FormData
): Promise<BordereauResult> {
  const { user, provider } = await requireProvider()

  const parsed = AjoutSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const v = parsed.data

  const supabase = await createServerSupabase()
  const { error } = await supabase.from('inv_missions').insert({
    provider_id: provider.id,
    manager_id: v.manager_id,
    category_id: v.category_id,
    detail: v.detail,
    start_date: v.start_date,
    end_date: v.start_date,
    pricing_type: 'forfait_mission',
    quantity: v.quantity,
    unit_amount_ht: v.unit_amount_ht,
    total_ht: round2(v.quantity * v.unit_amount_ht),
    status: 'submitted',
    origin: 'provider',
    submitted_at: new Date().toISOString(),
    statement_id: v.statement_id,
  })

  if (error) return { error: `Ajout impossible : ${error.message}` }

  await logAudit(supabase, {
    actorId: user.id,
    entityType: 'mission',
    entityId: v.statement_id,
    action: 'ajout_au_bordereau',
    payload: { montant: round2(v.quantity * v.unit_amount_ht) },
  })

  revalidatePath(`/bordereaux/${v.statement_id}`)
  return { success: 'Prestation ajoutée. Elle part en validation chez le responsable indiqué.' }
}

/** Le prestataire accepte son bordereau et passe à la facturation. */
export async function accepterBordereau(formData: FormData): Promise<void> {
  const { user, provider } = await requireProvider()
  const id = String(formData.get('statement_id') ?? '')
  if (!id) return

  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('inv_statements')
    .update({
      status: 'accepted',
      accepted_at: new Date().toISOString(),
      provider_responded_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('provider_id', provider.id)
    .in('status', ['sent', 'contested'])
    .select('id')

  if (data?.length) {
    await logAudit(supabase, {
      actorId: user.id,
      entityType: 'invoice',
      entityId: id,
      action: 'bordereau_accepte',
    })
  }

  revalidatePath(`/bordereaux/${id}`)
  redirect('/factures/nouvelle')
}
