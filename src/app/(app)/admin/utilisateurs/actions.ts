'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
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

  // On ferme d'abord la session administrateur : sans ça, la vérification
  // peut s'appliquer par-dessus une session résiduelle et viser le mauvais
  // compte. Portée locale : on ne déconnecte que ce navigateur, pas les
  // autres appareils de l'administrateur.
  await supabase.auth.signOut({ scope: 'local' })

  const { error: otpError } = await supabase.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: 'magiclink',
  })
  if (otpError) {
    console.error('[impersonate:verify]', otpError.message)
    return
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

  redirect(homePathFor(cible.role))
}

/**
 * Quitte le compte visité et rend sa session à l'administrateur.
 *
 * Avant, on se contentait de déconnecter : l'administrateur se retrouvait
 * sur l'écran de connexion et devait retaper son mot de passe. On rouvre
 * maintenant sa session, mais seulement si le cookie signé le désigne, si
 * la session en cours est bien celle du compte visité, et s'il est toujours
 * administrateur actif.
 */
export async function stopImpersonation(): Promise<void> {
  const prise = await readImpersonation()
  const supabase = await createServerSupabase()
  const service = createServiceClient()

  const {
    data: { user: courant },
  } = await supabase.auth.getUser()

  // Portée locale : le compte visité ne doit pas être déconnecté de ses
  // propres appareils parce qu'un administrateur quitte le sien.
  await supabase.auth.signOut({ scope: 'local' })

  const store = await cookies()
  store.delete(IMPERSONATION_COOKIE)

  if (!prise) redirect('/login')

  const [{ data: cible }, { data: admin }] = await Promise.all([
    service.from('inv_users').select('auth_id').eq('id', prise.targetId).maybeSingle(),
    service
      .from('inv_users')
      .select('id, email, role, is_active')
      .eq('id', prise.adminId)
      .maybeSingle(),
  ])

  const coherent =
    courant?.id !== undefined &&
    cible?.auth_id === courant.id &&
    admin?.role === 'admin' &&
    admin.is_active

  if (!coherent || !admin) redirect('/login')

  const { data: link, error } = await service.auth.admin.generateLink({
    type: 'magiclink',
    email: admin.email,
  })
  if (error || !link?.properties?.hashed_token) {
    console.error('[stopImpersonation]', error?.message)
    redirect('/login')
  }

  const { error: otpError } = await supabase.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: 'magiclink',
  })
  if (otpError) {
    console.error('[stopImpersonation:verify]', otpError.message)
    redirect('/login')
  }

  await logAudit(service, {
    actorId: admin.id,
    entityType: 'user',
    entityId: prise.targetId,
    action: 'impersonate_stop',
  })

  redirect('/admin/utilisateurs')
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
