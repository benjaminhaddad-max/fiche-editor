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
import { createInvitation } from '@/lib/invitation'
import { sendSms, normalizePhone } from '@/lib/email/sms'
import type { PricingType } from '@/lib/types'

export interface OrderResult {
  error?: string
  success?: string
}

const tarif = (type: PricingType, qte: number, pu: number) =>
  `${qte} ${PRICING_UNIT[type]} × ${money(pu)}`

const NouveauPresta = z.object({
  new_name: z.string().trim().min(2, 'Indiquez le nom du nouveau prestataire.').max(120),
  new_email: z.email('Email du nouveau prestataire invalide.').transform((v) => v.trim().toLowerCase()),
  new_phone: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || normalizePhone(v), 'Numéro de téléphone invalide.'),
})

type Db = ReturnType<typeof createServiceClient>

/**
 * Retrouve la personne par son email, ou lui crée un compte prestataire
 * sans mot de passe : elle le choisira en ouvrant son lien.
 */
async function prestatairePour(
  db: Db,
  v: z.infer<typeof NouveauPresta>
): Promise<{ providerId: string; userId: string; cree: boolean } | { error: string }> {
  const { data: existant } = await db
    .from('inv_users')
    .select('id, role, is_active, provider:inv_providers!inv_providers_user_id_fkey(id)')
    .ilike('email', v.new_email)
    .maybeSingle()
  if (existant) {
    const fiche = (existant as unknown as { provider: { id: string }[] | { id: string } | null }).provider
    const id = Array.isArray(fiche) ? fiche[0]?.id : fiche?.id
    if (existant.role !== 'prestataire' || !id) return { error: 'Cet email appartient à un membre de l’équipe.' }
    if (!existant.is_active) return { error: 'Ce prestataire est désactivé. Réactivez-le dans Équipe.' }
    return { providerId: id, userId: existant.id, cree: false }
  }

  const { data: auth, error: authError } = await db.auth.admin.createUser({ email: v.new_email, email_confirm: true })
  if (authError || !auth.user) return { error: `Création du compte impossible : ${authError?.message}` }

  const { data: user, error: userError } = await db
    .from('inv_users')
    .insert({ auth_id: auth.user.id, email: v.new_email, full_name: v.new_name, role: 'prestataire', phone: v.new_phone || null })
    .select('id')
    .single()
  if (userError || !user) {
    await db.auth.admin.deleteUser(auth.user.id)
    return { error: `Création du profil impossible : ${userError?.message}` }
  }

  const { data: fiche, error: ficheError } = await db
    .from('inv_providers')
    .insert({ user_id: user.id, legal_name: v.new_name, invoice_prefix: 'FACT', phone: v.new_phone || null })
    .select('id')
    .single()
  if (ficheError || !fiche) return { error: `Création de la fiche impossible : ${ficheError?.message}` }

  return { providerId: fiche.id, userId: user.id, cree: true }
}

const BonSchema = z
  .object({
    provider_id: z.union([z.uuid('Choisissez le prestataire.'), z.literal('nouveau')]),
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

  // ---- Prestataire existant, ou nouveau à créer
  let providerId = v.provider_id
  let nouveau: { userId: string; name: string; email: string; phone: string | null; cree: boolean } | null = null
  if (v.provider_id === 'nouveau') {
    const n = NouveauPresta.safeParse(Object.fromEntries(formData))
    if (!n.success) return { error: n.error.issues[0].message }
    const r = await prestatairePour(db, n.data)
    if ('error' in r) return { error: r.error }
    providerId = r.providerId
    nouveau = { userId: r.userId, name: n.data.new_name, email: n.data.new_email, phone: n.data.new_phone || null, cree: r.cree }
    if (r.cree) {
      await logAudit(null, { actorId: user.id, entityType: 'user', entityId: r.userId, action: 'compte_cree_par_bon', payload: { email: n.data.new_email } })
    }
  }

  const total = round2(v.quantity * v.unit_amount_ht)
  const { data: bon, error } = await db
    .from('inv_mission_orders')
    .insert({
      provider_id: providerId,
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

  const tarifTexte = tarif(v.pricing_type, v.quantity, v.unit_amount_ht)
  const app = process.env.NEXT_PUBLIC_APP_URL ?? 'https://facturation.diploma-sante.fr'

  // ---- Nouveau prestataire : le lien crée son accès puis ouvre ses bons.
  if (nouveau?.cree) {
    const jeton = await createInvitation(nouveau.userId, user.id)
    if (!jeton) return { error: 'Bon créé, mais le lien d’accès n’a pas pu être généré. Invitez la personne depuis Équipe.' }
    const lien = `${app}/bienvenue?invitation=${jeton}&suite=${encodeURIComponent('/missions?onglet=bons')}`
    await deliver({
      to: { email: nouveau.email, name: nouveau.name },
      ...templates.orderInvitation({
        name: nouveau.name,
        managerName: user.full_name,
        title: v.title,
        total,
        start: v.start_date,
        end: v.end_date,
        tarif: tarifTexte,
        conditions: v.conditions || null,
        link: lien,
      }),
      template: 'order_invitation',
      entityType: 'order',
      entityId: bon.id,
      providerId,
    })
    const sms = await sendSms(
      nouveau.phone,
      `Diploma Santé : ${user.full_name} vous propose une mission (${v.title}, ${money(total)} HT). Créez votre compte et répondez ici : ${lien}`
    )
    await db.from('inv_email_log').insert({
      to_email: nouveau.phone ?? '(sans numéro)',
      to_name: nouveau.name,
      template: 'sms_order_invitation',
      subject: v.title,
      entity_type: 'order',
      entity_id: bon.id,
      provider_id: providerId,
      status: sms.status,
      error: sms.error ?? null,
    })
    await logAudit(null, { actorId: user.id, entityType: 'mission', entityId: bon.id, action: 'bon_envoye', payload: { total, nouveau: true } })
    revalidatePath('/bons-de-mission')
    return {
      success: `Compte créé pour ${nouveau.name} et bon de mission envoyé à ${nouveau.email}${
        sms.status === 'sent' ? ' et par SMS' : ''
      }. Il choisit son mot de passe puis accepte la mission.`,
    }
  }

  // ---- Prestataire déjà inscrit
  const { data: p } = await db
    .from('inv_providers')
    .select('legal_name, user:inv_users!inv_providers_user_id_fkey(email, full_name)')
    .eq('id', providerId)
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
        tarif: tarifTexte,
      }),
      template: 'order_sent',
      entityType: 'order',
      entityId: bon.id,
      providerId,
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
