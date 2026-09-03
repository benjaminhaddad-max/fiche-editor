'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { homePathFor } from '@/lib/auth'
import { IMPERSONATION_COOKIE } from '@/lib/impersonation'
import { createServerSupabase } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendInvitation } from '@/lib/email/notify'
import { revalidatePath } from 'next/cache'

/**
 * Ouvre une session sur le compte d'un autre utilisateur, pour voir la
 * plateforme exactement comme lui.
 *
 * Réservé aux administrateurs, tracé dans le journal d'audit, et signalé
 * par un bandeau permanent — on ne doit jamais oublier qu'on n'est pas
 * chez soi. Impossible de viser un autre administrateur : ça éviterait de
 * contourner une désactivation.
 */
export async function impersonate(formData: FormData): Promise<void> {
  const admin = await requireRole('admin')
  const userId = String(formData.get('user_id') ?? '')
  if (!userId || userId === admin.id) return

  const service = createServiceClient()
  const { data: cible } = await service
    .from('inv_users')
    .select('id, email, full_name, role, is_active')
    .eq('id', userId)
    .maybeSingle()

  if (!cible || !cible.is_active || cible.role === 'admin') return

  // On passe par un lien magique à usage unique plutôt que par le mot de
  // passe : l'administrateur n'a jamais à le connaître.
  const { data: link, error } = await service.auth.admin.generateLink({
    type: 'magiclink',
    email: cible.email,
  })
  if (error || !link?.properties?.hashed_token) {
    console.error('[impersonate]', error?.message)
    return
  }

  const supabase = await createServerSupabase()
  const { error: otpError } = await supabase.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: 'magiclink',
  })
  if (otpError) {
    console.error('[impersonate:verify]', otpError.message)
    return
  }

  const store = await cookies()
  store.set(IMPERSONATION_COOKIE, admin.full_name, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 4,
    path: '/',
  })

  await logAudit(service, {
    actorId: admin.id,
    entityType: 'user',
    entityId: cible.id,
    action: 'impersonate',
    payload: { email: cible.email, role: cible.role },
  })

  redirect(homePathFor(cible.role))
}

/** Quitte le compte visité et revient à l'écran de connexion. */
export async function stopImpersonation(): Promise<void> {
  const supabase = await createServerSupabase()
  await supabase.auth.signOut()

  const store = await cookies()
  store.delete(IMPERSONATION_COOKIE)

  redirect('/login')
}

/** Envoie (ou renvoie) l'invitation permettant de choisir son mot de passe. */
export async function inviteUser(formData: FormData): Promise<void> {
  const admin = await requireRole('admin')
  const userId = String(formData.get('user_id') ?? '')
  if (!userId) return

  const envoye = await sendInvitation(userId)

  const service = createServiceClient()
  await logAudit(service, {
    actorId: admin.id,
    entityType: 'user',
    entityId: userId,
    action: envoye ? 'invitation_sent' : 'invitation_failed',
  })

  revalidatePath('/admin/utilisateurs')
}
