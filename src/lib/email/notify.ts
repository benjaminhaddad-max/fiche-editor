import { sendEmail } from '@/lib/email/brevo'
import { templates } from '@/lib/email/templates'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Envoie un email et le journalise. Ne leve jamais : une notification qui
 * echoue ne doit pas faire echouer la validation metier qui l'a declenchee.
 */
async function deliver(params: {
  to: { email: string; name?: string }
  subject: string
  html: string
  template: string
  entityType?: string
  entityId?: string
  providerId?: string | null
}): Promise<void> {
  const result = await sendEmail({
    to: params.to,
    subject: params.subject,
    html: params.html,
  })

  if (result.status === 'error') {
    console.error('[email]', params.template, result.error)
  }

  const supabase = createServiceClient()
  const { error } = await supabase.from('inv_email_log').insert({
    to_email: params.to.email,
    to_name: params.to.name ?? null,
    template: params.template,
    subject: params.subject,
    entity_type: params.entityType ?? null,
    entity_id: params.entityId ?? null,
    provider_id: params.providerId ?? null,
    brevo_message_id: result.messageId ?? null,
    status: result.status,
    error: result.error ?? null,
  })
  if (error) console.error('[email:log]', error.message)
}

/**
 * Invite une personne a creer son acces.
 *
 * Le lien porte un jeton a usage unique genere par Supabase : l'invitant ne
 * connait jamais le mot de passe, et la personne le choisit elle-meme.
 */
export async function sendInvitation(userId: string): Promise<boolean> {
  const supabase = createServiceClient()

  const { data: user } = await supabase
    .from('inv_users')
    .select('id, email, full_name, is_active, role')
    .eq('id', userId)
    .maybeSingle()

  if (!user?.is_active) return false

  const { data: link, error } = await supabase.auth.admin.generateLink({
    type: 'recovery',
    email: user.email,
  })
  if (error || !link?.properties?.hashed_token) {
    console.error('[invitation]', error?.message)
    return false
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://facturation.diploma-sante.fr'
  const href = `${appUrl}/bienvenue?token_hash=${link.properties.hashed_token}&type=recovery`

  const tpl =
    user.role === 'prestataire'
      ? templates.invitation({ fullName: user.full_name, link: href })
      : templates.invitationStaff({
          fullName: user.full_name,
          link: href,
          isAdmin: user.role === 'admin',
        })
  await deliver({
    to: { email: user.email, name: user.full_name },
    ...tpl,
    template: user.role === 'prestataire' ? 'invitation' : 'invitation_staff',
    entityType: 'user',
    entityId: user.id,
  })
  return true
}

/** Prevenir le prestataire qu'une prestation lui revient a corriger. */
export async function notifyMissionRejected(missionId: string): Promise<void> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('inv_missions')
    .select(
      `detail, rejection_reason, provider_id,
       provider:inv_providers(legal_name, user:inv_users!inv_providers_user_id_fkey(email, full_name)),
       rejecter:inv_users!inv_missions_rejected_by_fkey(full_name)`
    )
    .eq('id', missionId)
    .maybeSingle()

  const row = data as unknown as {
    detail: string
    rejection_reason: string | null
    provider_id: string
    provider: { legal_name: string; user: { email: string; full_name: string } | null } | null
    rejecter: { full_name: string } | null
  } | null

  const email = row?.provider?.user?.email
  if (!email) return

  const tpl = templates.missionRejected({
    providerName: row.provider?.user?.full_name ?? row.provider?.legal_name ?? '',
    detail: row.detail,
    reason: row.rejection_reason ?? 'non précisé',
    by: row.rejecter?.full_name ?? 'Diploma Santé',
  })

  await deliver({
    to: { email, name: row.provider?.user?.full_name },
    ...tpl,
    template: 'mission_rejected',
    entityType: 'mission',
    entityId: missionId,
    providerId: row.provider_id,
  })
}

/** Prevenir le prestataire qu'il a des prestations facturables. */
export async function notifyReadyToInvoice(providerId: string): Promise<void> {
  const supabase = createServiceClient()

  const { data: missions } = await supabase
    .from('inv_missions')
    .select('total_ht')
    .eq('provider_id', providerId)
    .eq('status', 'approved')
    .is('invoice_id', null)

  if (!missions?.length) return

  const { data: provider } = await supabase
    .from('inv_providers')
    .select('legal_name, user:inv_users!inv_providers_user_id_fkey(email, full_name)')
    .eq('id', providerId)
    .maybeSingle()

  const user = (provider as unknown as { user: { email: string; full_name: string } | null } | null)?.user
  if (!user?.email) return

  const tpl = templates.readyToInvoice({
    providerName: user.full_name,
    count: missions.length,
    total: missions.reduce((s, m) => s + Number(m.total_ht), 0),
  })

  await deliver({
    to: { email: user.email, name: user.full_name },
    ...tpl,
    template: 'ready_to_invoice',
    entityType: 'provider',
    entityId: providerId,
    providerId,
  })
}

/** Prevenir les administrateurs qu'une facture vient d'arriver. */
export async function notifyInvoiceReceived(invoiceId: string): Promise<void> {
  const supabase = createServiceClient()

  const { data } = await supabase
    .from('inv_invoices')
    .select('number, total_ttc, provider_id, provider:inv_providers(legal_name)')
    .eq('id', invoiceId)
    .maybeSingle()

  const invoice = data as unknown as {
    number: string
    total_ttc: number
    provider_id: string
    provider: { legal_name: string } | null
  } | null
  if (!invoice) return

  const { data: admins } = await supabase
    .from('inv_users')
    .select('email, full_name')
    .eq('role', 'admin')
    .eq('is_active', true)

  for (const admin of admins ?? []) {
    const tpl = templates.invoiceReceived({
      adminName: admin.full_name,
      providerName: invoice.provider?.legal_name ?? 'un prestataire',
      number: invoice.number,
      total: Number(invoice.total_ttc),
    })
    await deliver({
      to: { email: admin.email, name: admin.full_name },
      ...tpl,
      template: 'invoice_received',
      entityType: 'invoice',
      entityId: invoiceId,
      providerId: invoice.provider_id,
    })
  }
}
