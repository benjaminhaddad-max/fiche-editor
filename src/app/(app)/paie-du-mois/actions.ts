'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { cycleForMonth } from '@/lib/cycle'
import { deliver } from '@/lib/email/notify'
import { sendSms } from '@/lib/email/sms'
import { templates } from '@/lib/email/templates'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Relance les salariés qui n'ont pas encore renseigné leurs éléments.
 * Email, et SMS quand on a le numéro : c'est la veille de la clôture que
 * ça se joue.
 */
export async function relancerElements(fd: FormData): Promise<void> {
  const user = await requireRole('manager', 'admin')
  const mois = String(fd.get('mois') ?? '')
  const ids = fd.getAll('provider_id').map(String).filter(Boolean)
  if (!/^\d{4}-\d{2}$/.test(mois) || !ids.length) return

  const cycle = cycleForMonth(mois)
  const db = createServiceClient()
  const { data: fiches } = await db
    .from('inv_providers')
    .select('id, phone, user:inv_users!inv_providers_user_id_fkey(email, full_name)')
    .in('id', ids)

  const app = process.env.NEXT_PUBLIC_APP_URL ?? 'https://facturation.diploma-sante.fr'
  for (const f of (fiches ?? []) as unknown as {
    id: string
    phone: string | null
    user: { email: string; full_name: string } | null
  }[]) {
    if (!f.user) continue
    await deliver({
      to: { email: f.user.email, name: f.user.full_name },
      ...templates.payrollInputsRequest({
        name: f.user.full_name,
        label: cycle.label,
        deadline: cycle.declarationDeadline,
        relance: true,
      }),
      template: 'payroll_inputs_reminder',
      entityType: 'provider',
      entityId: f.id,
      providerId: f.id,
    })
    await sendSms(
      f.phone,
      `Diploma Santé : il manque vos éléments de paie de ${cycle.label} (heures sup., congés, transport, mutuelle). ${app}/elements-paie`
    )
    await db.from('inv_payroll_inputs').upsert(
      { provider_id: f.id, period: mois, reminded_at: new Date().toISOString() },
      { onConflict: 'provider_id,period' }
    )
  }

  await logAudit(null, {
    actorId: user.id,
    entityType: 'user',
    entityId: user.id,
    action: 'relance_elements_paie',
    payload: { mois, personnes: ids.length },
  })
  revalidatePath('/paie-du-mois')
}

/** Marque le mois comme transmis à la paie. */
export async function marquerTransmis(fd: FormData): Promise<void> {
  const user = await requireRole('manager', 'admin')
  const mois = String(fd.get('mois') ?? '')
  if (!/^\d{4}-\d{2}$/.test(mois)) return
  await createServiceClient()
    .from('inv_payroll_inputs')
    .update({ exported_at: new Date().toISOString() })
    .eq('period', mois)
    .is('exported_at', null)
  await logAudit(null, { actorId: user.id, entityType: 'user', entityId: user.id, action: 'elements_transmis', payload: { mois } })
  revalidatePath('/paie-du-mois')
}
