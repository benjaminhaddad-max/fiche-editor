'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireProvider, requireRole } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { managerCanEdit, todayParis } from '@/lib/cycle'
import { deliver } from '@/lib/email/notify'
import { templates } from '@/lib/email/templates'
import { money, round2 } from '@/lib/format'
import { PRICING_UNIT } from '@/lib/labels'
import { createServiceClient } from '@/lib/supabase/service'
import type { PricingType } from '@/lib/types'

export interface OrderResult {
  error?: string
  success?: string
}

const tarif = (type: PricingType, qte: number, pu: number) =>
  `${qte} ${PRICING_UNIT[type]} × ${money(pu)}`

const BonSchema = z
  .object({
    provider_id: z.uuid('Choisissez le prestataire.'),
    category_id: z.uuid('Choisissez le type de mission.'),
    title: z.string().trim().min(3, 'Donnez un intitulé à la mission.').max(200),
    conditions: z.string().trim().max(2000).optional(),
    start_date: z.iso.date('Date de début invalide.'),
    end_date: z.iso.date('Date de fin invalide.'),
    pricing_type: z.enum(['forfait_mission', 'forfait_horaire']),
    quantity: z.coerce.number<number>().positive('Quantité supérieure à 0.'),
    unit_amount_ht: z.coerce.number<number>().nonnegative('Tarif invalide.'),
  })
  .refine((v) => v.end_date >= v.start_date, {
    message: 'La fin doit suivre le début.',
    path: ['end_date'],
  })

/** Le manager propose une mission : le prestataire l'accepte ou non. */
export async function creerBon(_prev: OrderResult, formData: FormData): Promise<OrderResult> {
  const user = await requireRole('manager', 'admin')
  const parsed = BonSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const v = parsed.data

  const db = createServiceClient()
  const total = round2(v.quantity * v.unit_amount_ht)
  const { data: bon, error } = await db
    .from('inv_mission_orders')
    .insert({
      provider_id: v.provider_id,
      manager_id: user.id,
      category_id: v.category_id,
      title: v.title,
      conditions: v.conditions || null,
      start_date: v.start_date,
      end_date: v.end_date,
      pricing_type: v.pricing_type,
      quantity: v.quantity,
      unit_amount_ht: v.unit_amount_ht,
      total_ht: total,
    })
    .select('id')
    .single()
  if (error) return { error: `Envoi impossible : ${error.message}` }

  const { data: p } = await db
    .from('inv_providers')
    .select('legal_name, user:inv_users!inv_providers_user_id_fkey(email, full_name)')
    .eq('id', v.provider_id)
    .maybeSingle()
  const dest = (p as unknown as { user: { email: string; full_name: string } | null } | null)?.user

  if (dest) {
    await deliver({
      to: { email: dest.email, name: dest.full_name },
      ...templates.orderSent({
        providerName: dest.full_name,
        managerName: user.full_name,
        title: v.title,
        total,
        start: v.start_date,
        end: v.end_date,
        conditions: v.conditions || null,
        tarif: tarif(v.pricing_type, v.quantity, v.unit_amount_ht),
      }),
      template: 'order_sent',
      entityType: 'order',
      entityId: bon.id,
      providerId: v.provider_id,
    })
  }

  await logAudit(null, { actorId: user.id, entityType: 'mission', entityId: bon.id, action: 'bon_envoye', payload: { total } })
  revalidatePath('/bons-de-mission')
  return { success: `Bon de mission envoyé${dest ? ` à ${dest.full_name}` : ''}.` }
}

/** Le prestataire accepte ou refuse la mission proposée. */
export async function repondreBon(formData: FormData): Promise<void> {
  const { user, provider } = await requireProvider()
  const id = String(formData.get('order_id') ?? '')
  const accepte = formData.get('decision') === 'accept'
  const note = String(formData.get('note') ?? '').trim().slice(0, 1000) || null
  if (!id) return

  const db = createServiceClient()
  const { data: bon } = await db
    .from('inv_mission_orders')
    .update({ status: accepte ? 'accepted' : 'declined', responded_at: new Date().toISOString(), provider_note: note })
    .eq('id', id)
    .eq('provider_id', provider.id)
    .eq('status', 'sent')
    .select('title, manager:inv_users!inv_mission_orders_manager_id_fkey(email, full_name)')
    .maybeSingle()
  if (!bon) return

  const manager = (bon as unknown as { manager: { email: string; full_name: string } | null }).manager
  if (manager) {
    await deliver({
      to: { email: manager.email, name: manager.full_name },
      ...templates.orderAnswered({
        managerName: manager.full_name,
        providerName: user.full_name,
        title: bon.title,
        accepted: accepte,
        note,
      }),
      template: accepte ? 'order_accepted' : 'order_declined',
      entityType: 'order',
      entityId: id,
      providerId: provider.id,
    })
  }

  await logAudit(null, { actorId: user.id, entityType: 'mission', entityId: id, action: accepte ? 'bon_accepte' : 'bon_refuse' })
  revalidatePath('/missions')
}

/** Le manager annule un bon qui n'a pas encore donné lieu à une prestation. */
export async function annulerBon(formData: FormData): Promise<void> {
  const user = await requireRole('manager', 'admin')
  const id = String(formData.get('order_id') ?? '')
  if (!id) return
  const db = createServiceClient()
  let q = db.from('inv_mission_orders').update({ status: 'cancelled' }).eq('id', id).in('status', ['sent', 'accepted'])
  if (user.role === 'manager') q = q.eq('manager_id', user.id)
  await q
  await logAudit(null, { actorId: user.id, entityType: 'mission', entityId: id, action: 'bon_annule' })
  revalidatePath('/bons-de-mission')
}

const ClotureSchema = z.object({
  order_id: z.uuid(),
  detail: z.string().trim().min(3, 'Décrivez la prestation.').max(500),
  quantity: z.coerce.number<number>().positive('Quantité supérieure à 0.'),
  unit_amount_ht: z.coerce.number<number>().nonnegative('Montant invalide.'),
})

/**
 * Mission terminée : elle rejoint les prestations déclarées, déjà validée
 * par le manager puisque c'est lui qui la clôture — tel que prévu, ou
 * ajustée s'il y a eu du plus ou du moins.
 */
export async function cloturerBon(_prev: OrderResult, formData: FormData): Promise<OrderResult> {
  const user = await requireRole('manager', 'admin')
  const parsed = ClotureSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const v = parsed.data

  const db = createServiceClient()
  const { data: bon } = await db.from('inv_mission_orders').select('*').eq('id', v.order_id).maybeSingle()
  if (!bon) return { error: 'Bon de mission introuvable.' }
  if (user.role === 'manager' && bon.manager_id !== user.id) return { error: 'Ce bon ne vous appartient pas.' }
  if (bon.status !== 'accepted') return { error: 'Seul un bon accepté et non clôturé peut être clôturé.' }

  // Mois de la fin de mission, s'il est encore ouvert ; sinon le mois en cours.
  const date = user.role === 'admin' || managerCanEdit(bon.end_date) ? bon.end_date : todayParis()
  const now = new Date().toISOString()
  const total = round2(v.quantity * v.unit_amount_ht)

  const { data: mission, error } = await db
    .from('inv_missions')
    .insert({
      provider_id: bon.provider_id,
      manager_id: bon.manager_id,
      category_id: bon.category_id,
      detail: v.detail,
      start_date: bon.start_date <= date ? bon.start_date : date,
      end_date: date,
      pricing_type: bon.pricing_type,
      quantity: v.quantity,
      unit_amount_ht: v.unit_amount_ht,
      total_ht: total,
      status: user.role === 'admin' ? 'approved' : 'manager_approved',
      origin: 'order',
      order_id: bon.id,
      declared_by: user.id,
      submitted_at: now,
      manager_approved_at: now,
      manager_approved_by: user.id,
      ...(user.role === 'admin' ? { admin_approved_at: now, admin_approved_by: user.id } : {}),
    })
    .select('id')
    .single()
  if (error) return { error: `Clôture impossible : ${error.message}` }

  await db
    .from('inv_mission_orders')
    .update({ status: 'done', done_at: now, mission_id: mission.id })
    .eq('id', bon.id)

  const ajuste = total !== Number(bon.total_ht)
  await logAudit(null, {
    actorId: user.id,
    entityType: 'mission',
    entityId: mission.id,
    action: 'bon_cloture',
    payload: { order_id: bon.id, prevu: Number(bon.total_ht), realise: total, ajuste },
  })

  revalidatePath('/bons-de-mission')
  revalidatePath('/validation')
  redirect('/bons-de-mission?onglet=termines')
}
