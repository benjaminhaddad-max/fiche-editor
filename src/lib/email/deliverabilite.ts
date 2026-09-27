import { createServiceClient } from '@/lib/supabase/service'

/**
 * Est-ce que nos messages arrivent vraiment ?
 *
 * Brevo répond « accepté » à un envoi, puis le bloque à sa propre porte si
 * l'adresse a déjà rebondi une fois. Le message ne part jamais, et notre
 * journal garde « envoyé » : il consigne la réponse de l'API, pas le sort du
 * message. Un professeur a reçu dix-sept invitations de cette façon — aucune
 * n'a quitté Brevo, sa boîte n'existe pas, et son silence passait pour de la
 * négligence.
 *
 * On va donc demander à Brevo ce que sont devenus les envois, adresse par
 * adresse, et marquer celles qui n'ont jamais rien reçu.
 */

const EVENEMENTS = 'https://api.brevo.com/v3/smtp/statistics/events'

export interface Injoignable {
  userId: string
  nom: string
  email: string
  role: string
  bloques: number
  raison: string
}

export interface BilanAdresses {
  verifiees: number
  injoignables: Injoignable[]
  /** Adresses redevenues joignables depuis le dernier constat. */
  retablies: string[]
  ignore?: string
}

/** Le refus du serveur destinataire, en français et en une ligne. */
function raisonLisible(brut: string | undefined, bloques: number): string {
  const t = (brut ?? '').replace(/\s+/g, ' ')
  if (/5\.1\.1|NoSuchUser|does not exist|unknown recipient|no such/i.test(t)) return 'boîte inexistante'
  if (/mailbox full|quota|over.?quota/i.test(t)) return 'boîte pleine'
  if (/spam|blacklist|reputation|policy/i.test(t)) return 'refusée comme indésirable'
  if (/unsubscrib|désinscri/i.test(t)) return 'désinscrit de nos envois'
  if (t) return t.slice(0, 160)
  return `bloquée par Brevo (${bloques} envoi${bloques > 1 ? 's' : ''}) sans livraison`
}

interface Evenement {
  event: string
  reason?: string
}

async function evenements(apiKey: string, email: string): Promise<Evenement[]> {
  const url = `${EVENEMENTS}?email=${encodeURIComponent(email)}&limit=100`
  const res = await fetch(url, { headers: { 'api-key': apiKey } })
  if (!res.ok) throw new Error(`Brevo ${res.status}`)
  return ((await res.json()) as { events?: Evenement[] }).events ?? []
}

/**
 * Passe tous les comptes actifs en revue et met le constat à jour.
 *
 * Le verdict est volontairement prudent : on ne déclare une adresse
 * injoignable que si Brevo a bloqué des envois **et** n'en a livré aucun. Une
 * adresse qui a reçu ne serait-ce qu'un message garde le bénéfice du doute —
 * un blocage isolé peut n'être qu'une coupure passagère chez le destinataire.
 */
export async function verifierAdresses(): Promise<BilanAdresses> {
  const out: BilanAdresses = { verifiees: 0, injoignables: [], retablies: [] }
  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey) {
    out.ignore = 'BREVO_API_KEY absente : impossible de savoir ce que deviennent les envois.'
    return out
  }

  const db = createServiceClient()
  const { data: users } = await db
    .from('inv_users')
    .select('id, email, full_name, role, email_unreachable_at')
    .eq('is_active', true)

  for (const u of users ?? []) {
    let ev: Evenement[]
    try {
      ev = await evenements(apiKey, u.email as string)
    } catch {
      continue // Brevo indisponible : on ne condamne personne sur un silence.
    }
    out.verifiees++

    const livres = ev.filter((e) => e.event === 'delivered').length
    const bloques = ev.filter((e) => e.event === 'blocked').length
    const rebond = ev.find((e) => e.event === 'hardBounces' || e.event === 'softBounces')
    const injoignable = bloques > 0 && livres === 0

    if (injoignable) {
      const raison = raisonLisible(rebond?.reason, bloques)
      out.injoignables.push({
        userId: u.id as string,
        nom: u.full_name as string,
        email: u.email as string,
        role: u.role as string,
        bloques,
        raison,
      })
      await db
        .from('inv_users')
        .update({ email_unreachable_at: new Date().toISOString(), email_unreachable_reason: raison })
        .eq('id', u.id)
    } else if (u.email_unreachable_at) {
      // Adresse corrigée : le constat n'a plus lieu d'être.
      out.retablies.push(u.email as string)
      await db
        .from('inv_users')
        .update({ email_unreachable_at: null, email_unreachable_reason: null })
        .eq('id', u.id)
    }
  }

  return out
}
