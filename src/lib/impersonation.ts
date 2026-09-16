import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'

/**
 * Prise de main d'un administrateur sur un autre compte.
 *
 * Le cookie garde de quoi revenir : qui a pris la main, sur qui, jusqu'à
 * quand. Il est signé — sinon n'importe qui pourrait écrire l'identifiant
 * d'un administrateur dedans et se faire rendre sa session en cliquant sur
 * « Quitter ce compte ».
 */
export const IMPERSONATION_COOKIE = 'inv_impersonated_by'
export const IMPERSONATION_SECONDS = 60 * 60 * 4

export interface Impersonation {
  adminId: string
  adminName: string
  targetId: string
  exp: number
}

function secret(): string {
  const s = process.env.IMPERSONATION_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!s) throw new Error('Aucun secret disponible pour signer la prise de main.')
  return s
}

function sign(body: string): string {
  return createHmac('sha256', secret()).update(body).digest('base64url')
}

export function encodeImpersonation(data: Impersonation): string {
  const body = Buffer.from(JSON.stringify(data)).toString('base64url')
  return `${body}.${sign(body)}`
}

function decode(raw: string | undefined): Impersonation | null {
  if (!raw) return null
  const [body, mac] = raw.split('.')
  if (!body || !mac) return null

  const attendu = Buffer.from(sign(body))
  const recu = Buffer.from(mac)
  if (attendu.length !== recu.length || !timingSafeEqual(attendu, recu)) return null

  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString()) as Impersonation
    if (!data.adminId || !data.targetId || data.exp < Date.now() / 1000) return null
    return data
  } catch {
    return null
  }
}

export async function readImpersonation(): Promise<Impersonation | null> {
  const store = await cookies()
  return decode(store.get(IMPERSONATION_COOKIE)?.value)
}

/**
 * Nom de l'administrateur, pour le bandeau — seulement si l'on est bien sur
 * le compte visité. Un cookie resté en place après une déconnexion ne doit
 * pas faire croire à l'administrateur, revenu chez lui, qu'il est ailleurs.
 */
export async function getImpersonator(current: {
  id: string
  role: string
}): Promise<string | null> {
  const store = await cookies()
  const raw = store.get(IMPERSONATION_COOKIE)?.value
  if (!raw) return null

  const prise = decode(raw)
  if (prise) return prise.targetId === current.id ? prise.adminName : null

  // Ancien format (le nom en clair) : on garde le bandeau hors compte admin.
  return raw.includes('.') || current.role === 'admin' ? null : raw
}
