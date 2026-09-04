import { createHash, randomBytes } from 'node:crypto'
import { createServiceClient } from '@/lib/supabase/service'

/** Durée de vie d'une invitation. Généreuse à dessein : relancer vingt
 *  personnes parce qu'un lien a expiré coûte plus cher que le risque. */
export const INVITATION_DAYS = Number(process.env.INVITATION_DAYS ?? 30)

/** On ne stocke jamais le jeton en clair, seulement son empreinte. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function newToken(): string {
  return randomBytes(32).toString('base64url')
}

/** Crée un jeton d'invitation et renvoie sa valeur en clair, une seule fois. */
export async function createInvitation(
  userId: string,
  createdBy: string | null
): Promise<string | null> {
  const token = newToken()
  const expires = new Date(Date.now() + INVITATION_DAYS * 864e5).toISOString()

  const supabase = createServiceClient()
  const { error } = await supabase.from('inv_invitations').insert({
    user_id: userId,
    token_hash: hashToken(token),
    expires_at: expires,
    created_by: createdBy,
  })

  if (error) {
    console.error('[invitation]', error.message)
    return null
  }
  return token
}

export interface ExchangeResult {
  hashedToken?: string
  email?: string
  error?: string
}

/**
 * Échange notre jeton longue durée contre un jeton Supabase de courte durée.
 *
 * C'est ce décalage qui permet d'avoir un lien valable un mois : le jeton
 * Supabase n'est fabriqué qu'au moment du clic, il n'a donc pas le temps
 * d'expirer.
 */
export async function exchangeInvitation(token: string): Promise<ExchangeResult> {
  const supabase = createServiceClient()

  const { data: invitation } = await supabase
    .from('inv_invitations')
    .select('id, user_id, expires_at, used_at, exchanges')
    .eq('token_hash', hashToken(token))
    .maybeSingle()

  if (!invitation) return { error: 'Lien inconnu.' }
  if (invitation.used_at) return { error: 'Ce lien a déjà servi à créer un accès.' }
  if (new Date(invitation.expires_at) < new Date()) return { error: 'Ce lien a expiré.' }

  const { data: user } = await supabase
    .from('inv_users')
    .select('email, is_active')
    .eq('id', invitation.user_id)
    .maybeSingle()

  if (!user?.is_active) return { error: 'Ce compte n’est plus actif.' }

  const { data: link, error } = await supabase.auth.admin.generateLink({
    type: 'recovery',
    email: user.email,
  })
  if (error || !link?.properties?.hashed_token) {
    console.error('[invitation:exchange]', error?.message)
    return { error: 'Impossible d’ouvrir la session. Réessayez.' }
  }

  // On compte les ouvertures sans griller le jeton : recharger la page ne
  // doit pas condamner l'invitation. Elle n'est consommée qu'une fois le
  // mot de passe posé.
  await supabase
    .from('inv_invitations')
    .update({ exchanges: invitation.exchanges + 1 })
    .eq('id', invitation.id)

  return { hashedToken: link.properties.hashed_token, email: user.email }
}

/** Consomme définitivement l'invitation, une fois le mot de passe défini. */
export async function consumeInvitation(token: string): Promise<void> {
  const supabase = createServiceClient()
  await supabase
    .from('inv_invitations')
    .update({ used_at: new Date().toISOString() })
    .eq('token_hash', hashToken(token))
    .is('used_at', null)
}
