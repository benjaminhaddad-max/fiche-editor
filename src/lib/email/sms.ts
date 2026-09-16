/**
 * SMS transactionnels Brevo — POST /v3/transactionalSMS/send.
 *
 * Ne lève jamais. Sans crédit SMS sur le compte Brevo ou sans numéro, l'envoi
 * est simplement sauté : l'email part de toute façon.
 */

export interface SmsResult {
  status: 'sent' | 'skipped' | 'error'
  error?: string
}

/** Numéro français ou international → format attendu par Brevo (chiffres, indicatif). */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  let n = raw.replace(/[^\d+]/g, '')
  if (n.startsWith('+')) n = n.slice(1)
  else if (n.startsWith('00')) n = n.slice(2)
  else if (/^0[1-9]\d{8}$/.test(n)) n = `33${n.slice(1)}`
  return /^\d{6,15}$/.test(n) ? n : null
}

export async function sendSms(phone: string | null | undefined, content: string): Promise<SmsResult> {
  const apiKey = process.env.BREVO_API_KEY
  const recipient = normalizePhone(phone)
  if (!apiKey) return { status: 'skipped', error: 'BREVO_API_KEY absente' }
  if (!recipient) return { status: 'skipped', error: 'numéro absent ou invalide' }

  try {
    const res = await fetch('https://api.brevo.com/v3/transactionalSMS/send', {
      method: 'POST',
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        // 11 caractères alphanumériques au plus.
        sender: (process.env.BREVO_SMS_SENDER ?? 'DiplomaSant').slice(0, 11),
        recipient,
        content: content.slice(0, 320),
        type: 'transactional',
        unicodeEnabled: true,
      }),
    })
    if (!res.ok) return { status: 'error', error: `Brevo SMS ${res.status} : ${(await res.text()).slice(0, 200)}` }
    return { status: 'sent' }
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : String(err) }
  }
}
