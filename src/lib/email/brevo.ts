/**
 * Client Brevo — emails transactionnels.
 * POST https://api.brevo.com/v3/smtp/email, en-tete `api-key`.
 *
 * Sans BREVO_API_KEY, les envois sont ignores proprement (status 'skipped'
 * dans le journal) : la plateforme fonctionne, elle n'envoie simplement rien.
 */

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email'

export interface EmailRecipient {
  email: string
  name?: string
}

export interface SendEmailInput {
  to: EmailRecipient
  subject: string
  html: string
  replyTo?: EmailRecipient
}

export interface SendEmailResult {
  status: 'sent' | 'skipped' | 'error'
  messageId?: string
  error?: string
}

export function isBrevoConfigured(): boolean {
  return Boolean(process.env.BREVO_API_KEY)
}

function sender(): EmailRecipient {
  return {
    name: process.env.BREVO_SENDER_NAME ?? 'Diploma Santé — Facturation',
    // Doit etre une adresse VALIDEE dans Brevo (Settings > Senders),
    // sinon l'API repond 400 et rien ne part.
    email: process.env.BREVO_SENDER_EMAIL ?? 'contact@diploma-sante.fr',
  }
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey) return { status: 'skipped', error: 'BREVO_API_KEY absente' }

  try {
    const res = await fetch(BREVO_URL, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: sender(),
        to: [{ email: input.to.email, name: input.to.name }],
        replyTo: input.replyTo ?? sender(),
        subject: input.subject,
        htmlContent: input.html,
      }),
    })

    const body = await res.text()
    if (!res.ok) {
      return { status: 'error', error: `Brevo ${res.status} : ${body.slice(0, 300)}` }
    }

    let messageId: string | undefined
    try {
      messageId = JSON.parse(body).messageId
    } catch {
      /* Brevo renvoie parfois un corps vide sur succes. */
    }
    return { status: 'sent', messageId }
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : String(err) }
  }
}
