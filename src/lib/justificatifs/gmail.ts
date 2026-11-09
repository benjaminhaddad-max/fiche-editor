import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { createServiceClient } from '@/lib/supabase/service'
import { activeBrand, activeBrandId } from '@/lib/brand/actif'
import { addDays } from '@/lib/format'
import { classerDocument } from '@/lib/paie/bulletins'
import { motsDuNom } from '@/lib/justificatifs/correspondance'
import { fournisseursPrioritaires, moisPrecedent } from '@/lib/justificatifs/etat'
import { enregistrerRecu } from '@/lib/justificatifs/rapprochement'
import { lireReglages } from '@/lib/justificatifs/reglages'

/**
 * La boîte où les reçus arrivent déjà : celle de Ben.
 *
 * Anthropic, OpenAI, Google écrivent à benjamin.haddad@ depuis des années.
 * Leur faire changer d'adresse de facturation, c'est vingt réglages chez
 * vingt fournisseurs ; Ben préfère qu'on aille les chercher là. Même accès
 * que la boîte de dépôt : IMAP Gmail et un mot de passe d'application.
 *
 *   RECUS_GMAIL_EMAIL      l'adresse de la boîte (benjamin.haddad@…)
 *   RECUS_GMAIL_PASSWORD   son mot de passe d'application Google
 *
 * Sans elles, rien n'est relevé et l'écran le dit.
 */
export function gmailBranche(): boolean {
  return Boolean(process.env.RECUS_GMAIL_EMAIL && process.env.RECUS_GMAIL_PASSWORD)
}

/** Des émetteurs bancaires qui ne nomment personne : on ne les cherche pas. */
const ANONYMES = new Set(['carte', 'swan', 'fact', 'paypal', 'chq', 'net', 'prlv', 'sepa', 'sumup', 'pending', 'web'])

/**
 * Les mots à chercher dans l'expéditeur : un par fournisseur prioritaire,
 * dans l'ordre du débit. « GOOGLE ADS » et « GOOGLE CLOUD » donnent tous
 * deux « google ».
 */
export function motsAChercher(cles: string[], max = 25): string[] {
  const out: string[] = []
  for (const cle of cles) {
    const mot = motsDuNom(cle)[0]
    if (!mot || ANONYMES.has(mot) || out.includes(mot)) continue
    out.push(mot)
    if (out.length >= max) break
  }
  return out
}

export interface BilanGmail {
  inactif?: string
  messages: number
  recus: number
  ignores: number
  erreurs: number
  fournisseurs: string[]
  depuis?: string
}

const CURSEUR = 'gmail_curseur'

/**
 * Où la relève en est : le dernier mail traité, par son UID dans « Tous les
 * messages ». Un UID ne se réutilise pas tant que la boîte garde son
 * UIDVALIDITY ; si elle change, on repart de la date.
 */
interface Curseur {
  depuis: string
  uid?: number
  uidValidity?: string
}

async function lireCurseur(): Promise<Curseur> {
  const { data } = await createServiceClient()
    .from('inv_reglages')
    .select('valeur')
    .eq('brand', await activeBrandId())
    .eq('cle', CURSEUR)
    .maybeSingle()
  const c = data?.valeur as Curseur | undefined
  // Premier passage : on reprend le mois écoulé en entier.
  return c?.depuis ? c : { depuis: `${moisPrecedent(new Date().toISOString().slice(0, 7))}-01` }
}

async function ecrireCurseur(c: Curseur) {
  await createServiceClient()
    .from('inv_reglages')
    .upsert({ brand: await activeBrandId(), cle: CURSEUR, valeur: c, updated_at: new Date().toISOString() })
}

/**
 * Relève, en lecture seule, les mails à PDF des fournisseurs prioritaires.
 *
 * La boîte est ouverte en EXAMINE : aucun mail n'est marqué lu, déplacé ni
 * étiqueté — Ben ne voit aucune différence. On avance d'UID en UID, et un
 * PDF déjà gardé est reconnu à son Message-ID. Seuls les PDF que l'aiguillage reconnaît comme
 * reçus sont pris : une facture de prestataire qui arriverait là suit
 * toujours le circuit de la plateforme, et n'entre pas deux fois.
 *
 * Le passage est borné en nombre et en temps : la lecture d'un reçu prend
 * quelques secondes, et la tâche horaire n'en a que trois cents en tout. Le retard
 * — le mois d'octobre au premier passage — se rattrape d'heure en heure.
 */
export async function releverRecusGmail(opts: { max?: number; budgetMs?: number } = {}): Promise<BilanGmail> {
  const max = opts.max ?? 15
  const fin = Date.now() + (opts.budgetMs ?? 150_000)
  const bilan: BilanGmail = { messages: 0, recus: 0, ignores: 0, erreurs: 0, fournisseurs: [] }
  if (!(await activeBrand()).justificatifs) return { ...bilan, inactif: 'les reçus de cette boîte ne sont pas ceux de cette école' }
  if (!gmailBranche()) return { ...bilan, inactif: 'accès à la boîte non branché' }
  if (!(await lireReglages()).releveGmail) return { ...bilan, inactif: 'relève éteinte' }

  const mots = motsAChercher((await fournisseursPrioritaires()).map((r) => r.cle))
  bilan.fournisseurs = mots
  if (!mots.length) return { ...bilan, inactif: 'aucun fournisseur prioritaire' }

  const curseur = await lireCurseur()
  bilan.depuis = curseur.depuis
  const requete = `has:attachment filename:pdf -in:sent after:${curseur.depuis.replace(/-/g, '/')} {${mots.map((m) => `from:${m}`).join(' ')}}`

  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: process.env.RECUS_GMAIL_EMAIL!, pass: process.env.RECUS_GMAIL_PASSWORD! },
    logger: false,
  })
  await client.connect()
  try {
    // « Tous les messages » : un reçu archivé compte autant qu'un reçu en boîte.
    const boites = await client.list()
    const tous = boites.find((b) => b.specialUse === '\\All')?.path ?? 'INBOX'
    const verrou = await client.getMailboxLock(tous, { readOnly: true })
    try {
      const validite = client.mailbox && typeof client.mailbox === 'object' ? String(client.mailbox.uidValidity) : ''
      const apres = curseur.uidValidity === validite ? (curseur.uid ?? 0) : 0
      const uids = ((await client.search({ gmraw: requete }, { uid: true })) || [])
        .filter((u) => u > apres)
        .sort((a, b) => a - b)

      let dernier = apres
      let complet = true
      for (const uid of uids) {
        if (bilan.messages >= max || Date.now() > fin) {
          complet = false
          break
        }
        bilan.messages++
        try {
          const msg = await client.fetchOne(String(uid), { source: true }, { uid: true })
          if (msg && msg.source) {
            const mail = await simpleParser(msg.source)
            const pdfs = mail.attachments.filter(
              (a) => a.contentType === 'application/pdf' || a.filename?.toLowerCase().endsWith('.pdf')
            )
            for (const a of pdfs) {
              const type = await classerDocument(a.content).catch(() => 'autre' as const)
              if (type !== 'recu') {
                bilan.ignores++
                continue
              }
              const r = await enregistrerRecu({
                pdf: a.content,
                filename: a.filename?.toLowerCase().endsWith('.pdf') ? a.filename : `${a.filename ?? 'recu'}.pdf`,
                emailMessageId: mail.messageId ?? `gmail-uid-${validite}-${uid}`,
                inboundFrom: mail.from?.value?.[0]?.address ?? null,
                recuLe: mail.date ? mail.date.toISOString() : null,
                source: 'gmail',
              })
              if (r.ok) bilan.recus++
              else bilan.erreurs++
            }
          }
          dernier = uid
        } catch (err) {
          // Le mail fautif sera repris au passage suivant ; on s'arrête là
          // pour ne pas le sauter en avançant le curseur au-delà.
          bilan.erreurs++
          complet = false
          console.error('[recus gmail]', uid, err)
          break
        }
      }
      // Rattrapage fini : la recherche n'a plus besoin de remonter loin.
      await ecrireCurseur({
        depuis: complet ? addDays(new Date().toISOString().slice(0, 10), -7) : curseur.depuis,
        uid: dernier,
        uidValidity: validite,
      })
    } finally {
      verrou.release()
    }
  } finally {
    await client.logout()
  }
  return bilan
}
