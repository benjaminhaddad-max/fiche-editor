import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { traiterCourriel } from '@/lib/inbound/traiter'

export function boiteConfiguree(): boolean {
  return Boolean(process.env.DEPOT_FACTURES_EMAIL && process.env.DEPOT_FACTURES_PASSWORD)
}

/**
 * Relève la boîte depotfactures@ (Gmail, IMAP) : chaque message non lu est
 * traité puis marqué comme lu. Un message qui échoue reste non lu et sera
 * repris au passage suivant.
 */
export async function releverBoite(max = 10): Promise<{ lus: number; traites: number; ignores: number; erreurs: number }> {
  const bilan = { lus: 0, traites: 0, ignores: 0, erreurs: 0 }
  if (!boiteConfiguree()) return bilan

  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: process.env.DEPOT_FACTURES_EMAIL!, pass: process.env.DEPOT_FACTURES_PASSWORD! },
    logger: false,
  })
  await client.connect()
  const verrou = await client.getMailboxLock('INBOX')
  try {
    const uids = ((await client.search({ seen: false }, { uid: true })) || []).slice(0, max)
    for (const uid of uids) {
      bilan.lus++
      try {
        const msg = await client.fetchOne(String(uid), { source: true }, { uid: true })
        if (!msg || !msg.source) continue
        const mail = await simpleParser(msg.source)
        const adresses = [
          ...(mail.from?.value ?? []),
          ...(Array.isArray(mail.replyTo) ? mail.replyTo.flatMap((r) => r.value) : (mail.replyTo?.value ?? [])),
        ]
          .map((a) => a.address)
          .filter((a): a is string => Boolean(a))
        for (const cle of ['x-original-from', 'x-original-sender']) {
          const v = mail.headers.get(cle)
          const texte = typeof v === 'string' ? v : JSON.stringify(v ?? '')
          adresses.push(...(texte.match(/[\w.+-]+@[\w.-]+/g) ?? []))
        }

        const issue = await traiterCourriel({
          expediteurs: adresses,
          sujet: mail.subject ?? null,
          messageId: mail.messageId ?? null,
          pieces: mail.attachments
            .filter((a) => a.contentType === 'application/pdf' || a.filename?.toLowerCase().endsWith('.pdf'))
            .map((a) => ({
              nom: a.filename?.toLowerCase().endsWith('.pdf') ? a.filename : `${a.filename ?? 'facture'}.pdf`,
              contenu: a.content,
            })),
        })
        if (issue === 'ignore') bilan.ignores++
        else bilan.traites++
        await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true })
      } catch (err) {
        bilan.erreurs++
        console.error('[depotfactures]', uid, err)
      }
    }
  } finally {
    verrou.release()
    await client.logout()
  }
  return bilan
}
