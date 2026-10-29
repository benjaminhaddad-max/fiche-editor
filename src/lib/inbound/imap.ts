import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { traiterCourriel } from '@/lib/inbound/traiter'
import { identifiantsDepot, servedBrandIds, type BrandId } from '@/lib/brand'
import { sousMarque } from '@/lib/brand/actif'

export interface Bilan {
  lus: number
  traites: number
  ignores: number
  erreurs: number
}

interface Boite {
  brand: BrandId
  user: string
  pass: string
}

const vide = (): Bilan => ({ lus: 0, traites: 0, ignores: 0, erreurs: 0 })

/**
 * Les boîtes de dépôt que ce déploiement doit relever : une par école.
 *
 * Une facture déposée est rapprochée de l'équipe de son école. Relever la
 * boîte de Medibox sous la marque du déploiement chercherait donc
 * l'expéditeur dans l'équipe de Diploma, et l'accusé de réception partirait
 * au mauvais manager. Chaque boîte se relève sous son école.
 *
 * Deux écoles qui partagent une adresse ne la relèvent qu'une fois, sous la
 * marque du déploiement : `servedBrandIds()` la place en tête.
 */
export function boitesDeDepot(): Boite[] {
  const boites: Boite[] = []
  const vues = new Set<string>()
  for (const brand of servedBrandIds()) {
    const { email: user, motDePasse: pass } = identifiantsDepot(brand)
    if (!user || !pass || vues.has(user.toLowerCase())) continue
    vues.add(user.toLowerCase())
    boites.push({ brand, user, pass })
  }
  return boites
}

export function boiteConfiguree(): boolean {
  return boitesDeDepot().length > 0
}

/**
 * Relève les boîtes de dépôt, chacune sous l'école à laquelle elle appartient.
 *
 * Une boîte qui refuse la connexion — mot de passe d'application révoqué,
 * IMAP coupé — ne doit pas empêcher les autres d'être relevées.
 */
export async function releverBoite(max = 10): Promise<Bilan & { boites: Record<string, Bilan> }> {
  const total = vide()
  const boites: Record<string, Bilan> = {}
  for (const boite of boitesDeDepot()) {
    let bilan: Bilan
    try {
      bilan = await sousMarque(boite.brand, () => releverUneBoite(boite, max))
    } catch (err) {
      console.error('[depotfactures]', boite.user, err)
      bilan = { ...vide(), erreurs: 1 }
    }
    boites[boite.brand] = bilan
    total.lus += bilan.lus
    total.traites += bilan.traites
    total.ignores += bilan.ignores
    total.erreurs += bilan.erreurs
  }
  return { ...total, boites }
}

/**
 * Relève une boîte depotfactures@ (Gmail, IMAP) : chaque message non lu est
 * traité puis marqué comme lu. Un message qui échoue reste non lu et sera
 * repris au passage suivant.
 */
async function releverUneBoite(boite: Boite, max: number): Promise<Bilan> {
  const bilan = vide()
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: boite.user, pass: boite.pass },
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
        console.error('[depotfactures]', boite.user, uid, err)
      }
    }
  } finally {
    verrou.release()
    await client.logout()
  }
  return bilan
}
