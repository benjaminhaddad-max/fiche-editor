'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { getSessionUser } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { deliver } from '@/lib/email/notify'
import { sendSms } from '@/lib/email/sms'
import { templates } from '@/lib/email/templates'
import { createServiceClient } from '@/lib/supabase/service'
import type { AppUser } from '@/lib/types'

export interface MessageResult {
  error?: string
}

type Db = ReturnType<typeof createServiceClient>

/** Le fil est-il accessible à cette personne ? Renvoie le fil, ou null. */
async function filAccessible(db: Db, user: AppUser, threadId: string) {
  const { data: fil } = await db
    .from('inv_threads')
    .select('id, subject, provider_id, manager_id, provider:inv_providers(legal_name, user_id)')
    .eq('id', threadId)
    .maybeSingle()
  if (!fil) return null
  const provider = (fil as unknown as { provider: { legal_name: string; user_id: string | null } | null }).provider
  if (user.role === 'admin') return { ...fil, provider }
  if (user.role === 'manager' && fil.manager_id === user.id) return { ...fil, provider }
  if (user.role === 'prestataire' && provider?.user_id === user.id) return { ...fil, provider }
  return null
}

/**
 * Prévient l'autre partie. Un message de prestataire alerte le manager par
 * email ET par SMS : c'est souvent la veille d'une échéance qu'on écrit.
 */
async function prevenir(
  db: Db,
  auteur: AppUser,
  fil: { id: string; subject: string; provider_id: string; manager_id: string; provider: { legal_name: string; user_id: string | null } | null },
  corps: string
) {
  const extrait = corps.length > 400 ? `${corps.slice(0, 400)}…` : corps
  const href = `/messages/${fil.id}`

  if (auteur.role === 'prestataire') {
    const { data: m } = await db.from('inv_users').select('email, full_name, phone').eq('id', fil.manager_id).maybeSingle()
    if (!m) return
    await deliver({
      to: { email: m.email, name: m.full_name },
      ...templates.messageReceived({ recipientName: m.full_name, authorName: auteur.full_name, subject: fil.subject, excerpt: extrait, href }),
      template: 'message_received',
      entityType: 'thread',
      entityId: fil.id,
      providerId: fil.provider_id,
    })
    const sms = await sendSms(
      m.phone,
      `Diploma Invoice — ${auteur.full_name} vous a écrit (${fil.subject}) : « ${corps.slice(0, 120)}${corps.length > 120 ? '…' : ''} » Répondre : ${process.env.NEXT_PUBLIC_APP_URL ?? ''}${href}`
    )
    await db.from('inv_email_log').insert({
      to_email: m.phone ?? '(sans numéro)',
      to_name: m.full_name,
      template: 'sms_message_received',
      subject: fil.subject,
      entity_type: 'thread',
      entity_id: fil.id,
      provider_id: fil.provider_id,
      status: sms.status,
      error: sms.error ?? null,
    })
    return
  }

  if (!fil.provider?.user_id) return
  const { data: p } = await db.from('inv_users').select('email, full_name').eq('id', fil.provider.user_id).maybeSingle()
  if (!p) return
  await deliver({
    to: { email: p.email, name: p.full_name },
    ...templates.messageReceived({ recipientName: p.full_name, authorName: auteur.full_name, subject: fil.subject, excerpt: extrait, href }),
    template: 'message_received',
    entityType: 'thread',
    entityId: fil.id,
    providerId: fil.provider_id,
  })
}

const NouveauFil = z.object({
  subject: z.string().trim().min(3, 'Donnez un objet à votre message.').max(160),
  body: z.string().trim().min(2, 'Écrivez votre message.').max(5000),
  manager_id: z.uuid().optional(),
  provider_id: z.uuid().optional(),
  statement_id: z.uuid().optional(),
})

/** Ouvre une conversation entre un prestataire et un manager. */
export async function ouvrirFil(_prev: MessageResult, formData: FormData): Promise<MessageResult> {
  const user = await getSessionUser()
  if (!user) return { error: 'Session expirée.' }
  const parsed = NouveauFil.safeParse({
    subject: formData.get('subject'),
    body: formData.get('body'),
    manager_id: formData.get('manager_id') || undefined,
    provider_id: formData.get('provider_id') || undefined,
    statement_id: formData.get('statement_id') || undefined,
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const v = parsed.data
  const db = createServiceClient()

  let providerId: string
  let managerId: string
  if (user.role === 'prestataire') {
    const { data: p } = await db.from('inv_providers').select('id').eq('user_id', user.id).maybeSingle()
    if (!p) return { error: 'Fiche prestataire introuvable.' }
    if (!v.manager_id) return { error: 'Choisissez à qui écrire.' }
    providerId = p.id
    managerId = v.manager_id
  } else {
    if (!v.provider_id) return { error: 'Choisissez le prestataire.' }
    providerId = v.provider_id
    managerId = user.role === 'manager' ? user.id : (v.manager_id ?? user.id)
  }

  const { data: fil, error } = await db
    .from('inv_threads')
    .insert({
      provider_id: providerId,
      manager_id: managerId,
      subject: v.subject,
      created_by: user.id,
      statement_id: v.statement_id ?? null,
    })
    .select('id, subject, provider_id, manager_id, provider:inv_providers(legal_name, user_id)')
    .single()
  if (error) return { error: `Envoi impossible : ${error.message}` }

  await db.from('inv_messages').insert({ thread_id: fil.id, author_id: user.id, body: v.body })
  await db.from('inv_thread_reads').upsert({ thread_id: fil.id, user_id: user.id, read_at: new Date().toISOString() })
  await prevenir(db, user, fil as never, v.body)
  await logAudit(null, { actorId: user.id, entityType: 'user', entityId: fil.id, action: 'fil_ouvert' })

  revalidatePath('/messages')
  redirect(`/messages/${fil.id}`)
}

/** Répond dans une conversation existante. */
export async function repondre(_prev: MessageResult, formData: FormData): Promise<MessageResult> {
  const user = await getSessionUser()
  if (!user) return { error: 'Session expirée.' }
  const threadId = String(formData.get('thread_id') ?? '')
  const body = String(formData.get('body') ?? '').trim()
  if (body.length < 1) return { error: 'Écrivez votre message.' }
  if (body.length > 5000) return { error: '5 000 caractères au plus.' }

  const db = createServiceClient()
  const fil = await filAccessible(db, user, threadId)
  if (!fil) return { error: 'Conversation introuvable.' }

  const now = new Date().toISOString()
  const { error } = await db.from('inv_messages').insert({ thread_id: fil.id, author_id: user.id, body })
  if (error) return { error: `Envoi impossible : ${error.message}` }
  await db.from('inv_threads').update({ last_message_at: now, closed_at: null }).eq('id', fil.id)
  await db.from('inv_thread_reads').upsert({ thread_id: fil.id, user_id: user.id, read_at: now })
  await prevenir(db, user, fil as never, body)

  revalidatePath(`/messages/${fil.id}`)
  revalidatePath('/messages')
  return {}
}

/** Marque le fil comme résolu ; un nouveau message le rouvre. */
export async function clore(formData: FormData): Promise<void> {
  const user = await getSessionUser()
  if (!user) return
  const db = createServiceClient()
  const fil = await filAccessible(db, user, String(formData.get('thread_id') ?? ''))
  if (!fil) return
  await db.from('inv_threads').update({ closed_at: new Date().toISOString() }).eq('id', fil.id)
  revalidatePath(`/messages/${fil.id}`)
  revalidatePath('/messages')
}

/** Note que la personne a lu le fil jusqu'ici. */
export async function marquerLu(threadId: string): Promise<void> {
  const user = await getSessionUser()
  if (!user) return
  const db = createServiceClient()
  if (!(await filAccessible(db, user, threadId))) return
  await db.from('inv_thread_reads').upsert({ thread_id: threadId, user_id: user.id, read_at: new Date().toISOString() })
}
