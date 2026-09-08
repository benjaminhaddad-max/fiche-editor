import { sendEmail } from '@/lib/email/brevo'
import { templates } from '@/lib/email/templates'
import { createServiceClient } from '@/lib/supabase/service'
import { createInvitation } from '@/lib/invitation'

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
export async function sendInvitation(
  userId: string,
  invitedBy?: string,
  options?: { renewed?: boolean }
): Promise<boolean> {
  const supabase = createServiceClient()

  const { data: user } = await supabase
    .from('inv_users')
    .select('id, email, full_name, is_active, role')
    .eq('id', userId)
    .maybeSingle()

  if (!user?.is_active) return false

  const token = await createInvitation(user.id, invitedBy ?? null)
  if (!token) return false

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://facturation.diploma-sante.fr'
  const href = `${appUrl}/bienvenue?invitation=${token}`

  const renewed = options?.renewed ?? false
  const tpl =
    user.role === 'prestataire'
      ? templates.invitation({ fullName: user.full_name, link: href, renewed })
      : templates.invitationStaff({
          fullName: user.full_name,
          link: href,
          isAdmin: user.role === 'admin',
          renewed,
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

/**
 * Renvoi d'un lien d'accès demandé par la personne elle-même, depuis la page
 * d'arrivée ou la page de connexion.
 *
 * Deux règles :
 *   - la réponse ne dit jamais si l'adresse existe (elle serait un annuaire) ;
 *   - deux demandes rapprochées ne déclenchent qu'un seul envoi, sinon la
 *     boîte de réception se remplit de liens qui s'annulent l'un l'autre.
 */
export async function renewAccess(email: string): Promise<void> {
  const propre = email.trim().toLowerCase()
  if (!propre) return

  const supabase = createServiceClient()
  const { data: user } = await supabase
    .from('inv_users')
    .select('id, is_active')
    .ilike('email', propre)
    .maybeSingle()

  if (!user?.is_active) return

  const { data: recent } = await supabase
    .from('inv_invitations')
    .select('created_at')
    .eq('user_id', user.id)
    .gte('created_at', new Date(Date.now() - 120_000).toISOString())
    .limit(1)

  if (recent?.length) return

  await sendInvitation(user.id, undefined, { renewed: true })
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

/** Le bordereau est arbitré : on rend la main au prestataire, avec une date. */
export async function notifyStatementCleared(
  statementId: string,
  reply: string | null
): Promise<void> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('inv_statements')
    .select(`total_ht, invoice_deadline, invoice_expected_at, payment_start, provider_id,
             provider:inv_providers(legal_name, user:inv_users!inv_providers_user_id_fkey(email, full_name))`)
    .eq('id', statementId)
    .maybeSingle()

  const row = data as unknown as {
    total_ht: number
    invoice_deadline: string
    invoice_expected_at: string | null
    payment_start: string
    provider_id: string
    provider: { legal_name: string; user: { email: string; full_name: string } | null } | null
  } | null

  const user = row?.provider?.user
  if (!user?.email) return

  const tpl = templates.statementCleared({
    providerName: user.full_name,
    total: Number(row!.total_ht),
    deadline: row!.invoice_expected_at ?? row!.invoice_deadline,
    paymentStart: row!.payment_start,
    reply,
  })

  await deliver({
    to: { email: user.email, name: user.full_name },
    ...tpl,
    template: 'statement_cleared',
    entityType: 'invoice',
    entityId: statementId,
    providerId: row!.provider_id,
  })
}

/** Relance : la facture se fait attendre et l'échéance approche. */
export async function notifyStatementReminder(statementId: string): Promise<boolean> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('inv_statements')
    .select(`total_ht, invoice_deadline, invoice_expected_at, provider_id, reminder_count,
             provider:inv_providers(legal_name, user:inv_users!inv_providers_user_id_fkey(email, full_name))`)
    .eq('id', statementId)
    .maybeSingle()

  const row = data as unknown as {
    total_ht: number
    invoice_deadline: string
    invoice_expected_at: string | null
    provider_id: string
    reminder_count: number
    provider: { user: { email: string; full_name: string } | null } | null
  } | null

  const user = row?.provider?.user
  if (!user?.email) return false

  const deadline = row!.invoice_expected_at ?? row!.invoice_deadline
  const jours = Math.max(
    0,
    Math.ceil((new Date(`${deadline}T12:00:00Z`).getTime() - Date.now()) / 864e5)
  )

  const tpl = templates.statementReminder({
    providerName: user.full_name,
    total: Number(row!.total_ht),
    deadline,
    joursRestants: jours,
  })

  await deliver({
    to: { email: user.email, name: user.full_name },
    ...tpl,
    template: 'statement_reminder',
    entityType: 'invoice',
    entityId: statementId,
    providerId: row!.provider_id,
  })

  await supabase
    .from('inv_statements')
    .update({ reminded_at: new Date().toISOString(), reminder_count: row!.reminder_count + 1 })
    .eq('id', statementId)

  return true
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
