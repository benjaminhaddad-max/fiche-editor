import { activeBrand } from '@/lib/brand/actif'
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
  /** Pieces jointes, encodees en base64 par l'appelant. */
  attachments?: { name: string; content: string }[]
}

export interface SendEmailResult {
  status: 'sent' | 'skipped' | 'error'
  messageId?: string
  error?: string
}

export function isBrevoConfigured(): boolean {
  return Boolean(process.env.BREVO_API_KEY)
}

const ADRESSE_PAR_DEFAUT = process.env.BREVO_SENDER_EMAIL ?? 'facturation@diploma-sante.fr'

/** Les adresses validées chez Brevo, seules autorisées à expédier. */
function adressesValidees(): string[] {
  return (process.env.BREVO_SENDERS_VERIFIES ?? ADRESSE_PAR_DEFAUT)
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

/**
 * Qui envoie le message.
 *
 * Le nom affiché suit l'école — Nolwenn recevait ses propres calendriers
 * signés « Facturation Diploma Santé ». L'adresse, elle, ne suit que si
 * elle est validée chez Brevo : une adresse inconnue fait répondre 400 à
 * l'API et rien ne part. Mieux vaut un nom juste sur une adresse qui
 * fonctionne qu'un message qui n'arrive pas.
 */
async function sender(): Promise<EmailRecipient> {
  const m = await activeBrand()
  const voulue = m.email.senderEmail.toLowerCase()
  return {
    name: m.email.senderName,
    email: adressesValidees().includes(voulue) ? voulue : ADRESSE_PAR_DEFAUT,
  }
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey) return { status: 'skipped', error: 'BREVO_API_KEY absente' }
  const expediteur = await sender()

  try {
    const res = await fetch(BREVO_URL, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: expediteur,
        to: [{ email: input.to.email, name: input.to.name }],
        replyTo: input.replyTo ?? expediteur,
        subject: input.subject,
        htmlContent: input.html,
        ...(input.attachments?.length
          ? { attachment: input.attachments.map((a) => ({ name: a.name, content: a.content })) }
          : {}),
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
