'use server'

import { cookies } from 'next/headers'
import { requireRole } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { homePathFor } from '@/lib/auth'
import {
  IMPERSONATION_COOKIE,
  IMPERSONATION_SECONDS,
  encodeImpersonation,
  readImpersonation,
} from '@/lib/impersonation'
import { createServerSupabase } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendInvitation } from '@/lib/email/notify'
import { revalidatePath } from 'next/cache'

export interface SessionSwitch {
  tokenHash?: string
  destination?: string
  error?: string
  /** Pourquoi le retour à l'administrateur a été refusé. */
  refus?: string
}

/**
 * Prépare la prise de main sur le compte d'un autre utilisateur.
 *
 * Réservé aux administrateurs, tracé dans le journal d'audit, et signalé
 * par un bandeau permanent. Impossible de viser un autre administrateur :
 * ça permettrait de contourner une désactivation.
 *
 * Le serveur ne change PAS la session lui-même : il renvoie un jeton à usage
 * unique que le navigateur échange. Changer de session dans l'action puis
 * rediriger faisait afficher la page suivante avec l'ancienne session — la
 * prise de main semblait ne rien faire, et « Quitter ce compte » laissait
 * sur le compte visité. Le navigateur, lui, écrit ses cookies avant de
 * recharger : c'est ce que fait déjà la page d'invitation, sans histoire.
 */
export async function prepareImpersonation(userId: string): Promise<SessionSwitch> {
  const admin = await requireRole('admin')
  if (!userId || userId === admin.id) return { error: 'Compte invalide.' }

  const service = createServiceClient()
  const { data: cible } = await service
    .from('inv_users')
    .select('id, email, full_name, role, is_active')
    .eq('id', userId)
    .maybeSingle()

  if (!cible || !cible.is_active || cible.role === 'admin') {
    return { error: 'Ce compte ne peut pas être ouvert.' }
  }

  const { data: link, error } = await service.auth.admin.generateLink({
    type: 'magiclink',
    email: cible.email,
  })
  if (error || !link?.properties?.hashed_token) {
    console.error('[impersonate]', error?.message)
    return { error: 'Impossible d’ouvrir ce compte. Réessayez.' }
  }

  const store = await cookies()
  store.set(
    IMPERSONATION_COOKIE,
    encodeImpersonation({
      adminId: admin.id,
      adminName: admin.full_name,
      targetId: cible.id,
      exp: Math.floor(Date.now() / 1000) + IMPERSONATION_SECONDS,
    }),
    {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: IMPERSONATION_SECONDS,
      path: '/',
    }
  )

  await logAudit(service, {
    actorId: admin.id,
    entityType: 'user',
    entityId: cible.id,
    action: 'impersonate',
    payload: { email: cible.email, role: cible.role },
  })

  return { tokenHash: link.properties.hashed_token, destination: homePathFor(cible.role) }
}

/**
 * Prépare le retour de l'administrateur sur son propre compte.
 *
 * Le jeton n'est rendu que si le cookie signé le désigne, si la session en
 * cours est bien celle du compte visité, et s'il est toujours
 * administrateur actif. Sinon, pas de jeton : le navigateur se déconnecte.
 */
export async function prepareStopImpersonation(): Promise<SessionSwitch> {
  const store = await cookies()
  const brut = store.get(IMPERSONATION_COOKIE)?.value
  const prise = await readImpersonation()
  store.delete(IMPERSONATION_COOKIE)

  const supabase = await createServerSupabase()
  const service = createServiceClient()
  const {
    data: { user: courant },
    error: erreurSession,
  } = await supabase.auth.getUser()

  // Un refus renvoie à l'écran de connexion : on en garde le motif exact,
  // sans quoi on ne peut que deviner lequel des contrôles a bloqué.
  const refuser = async (raison: string, detail: Record<string, unknown> = {}) => {
    console.warn('[stopImpersonation] refus :', raison, detail)
    if (prise?.adminId) {
      await logAudit(service, {
        actorId: prise.adminId,
        entityType: 'user',
        entityId: prise.targetId,
        action: 'impersonate_stop_refused',
        payload: { raison, ...detail },
      })
    }
    return { refus: raison }
  }

  if (!prise) {
    return refuser(brut ? 'cookie illisible' : 'cookie absent', {
      longueur: brut?.length ?? 0,
    })
  }
  if (!courant) return refuser('aucune session en cours', { erreur: erreurSession?.message })

  const [{ data: cible }, { data: admin }] = await Promise.all([
    service.from('inv_users').select('auth_id').eq('id', prise.targetId).maybeSingle(),
    service
      .from('inv_users')
      .select('id, email, role, is_active')
      .eq('id', prise.adminId)
      .maybeSingle(),
  ])

  if (cible?.auth_id !== courant.id) {
    return refuser('la session n’est pas celle du compte visité', {
      session: courant.id,
      attendu: cible?.auth_id ?? null,
    })
  }
  if (!admin || admin.role !== 'admin' || !admin.is_active) {
    return refuser('administrateur introuvable ou inactif')
  }

  const { data: link, error } = await service.auth.admin.generateLink({
    type: 'magiclink',
    email: admin.email,
  })
  if (error || !link?.properties?.hashed_token) {
    return refuser('lien de retour impossible', { erreur: error?.message })
  }

  await logAudit(service, {
    actorId: admin.id,
    entityType: 'user',
    entityId: prise.targetId,
    action: 'impersonate_stop',
  })

  return { tokenHash: link.properties.hashed_token, destination: '/admin/utilisateurs' }
}

/**
 * Envoie (ou renvoie) l'invitation permettant de choisir son mot de passe.
 * Accepte une ou plusieurs personnes : c'est le même geste, qu'on relance
 * un retardataire ou qu'on ouvre les accès à toute une promotion de coachs.
 */
export async function inviteUsers(formData: FormData): Promise<void> {
  const admin = await requireRole('admin')
  const ids = formData.getAll('user_id').map(String).filter(Boolean)
  if (ids.length === 0) return

  const service = createServiceClient()

  // En série plutôt qu'en parallèle : Brevo limite le débit, et une rafale
  // de vingt envois simultanés se ferait refuser en partie.
  for (const id of ids) {
    const envoye = await sendInvitation(id, admin.id)
    await logAudit(service, {
      actorId: admin.id,
      entityType: 'user',
      entityId: id,
      action: envoye ? 'invitation_sent' : 'invitation_failed',
      payload: { lot: ids.length },
    })
  }

  revalidatePath('/admin/utilisateurs')
}
