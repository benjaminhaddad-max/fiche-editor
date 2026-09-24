import type { BillingCycle } from '@/lib/cycle'
import { deliver, sendInvitation } from '@/lib/email/notify'
import { templates } from '@/lib/email/templates'
import { createServiceClient } from '@/lib/supabase/service'

export interface Relance {
  /** Ceux qui ont déjà un accès : on leur rappelle de déclarer. */
  rappeles: number
  /** Ceux qui ne sont jamais venus : on leur (re)donne un lien d'entrée. */
  invites: number
  /** Ceux qui ont déjà tout déclaré ce mois-ci : inutile de les déranger. */
  ignores: number
  /** Managers prévenus pour leurs factures diverses. */
  managers: number
  echecs: string[]
}

/**
 * Relance tous les prestataires actifs, chacun selon où il en est.
 *
 * Quelqu'un qui n'est jamais entré n'a que faire d'un rappel de date : il
 * lui faut d'abord un lien pour créer son mot de passe. Quelqu'un qui a
 * déjà déclaré ce mois-ci n'a besoin de rien. Les autres reçoivent la date
 * limite. Un seul message par personne, celui qui la concerne.
 */
export async function relancerDeclarations(
  cycle: BillingCycle,
  auteurId: string | null
): Promise<Relance> {
  const db = createServiceClient()
  const out: Relance = { rappeles: 0, invites: 0, ignores: 0, managers: 0, echecs: [] }

  const [{ data: gens }, { data: invitations }, { data: missions }] = await Promise.all([
    db
      .from('inv_users')
      .select('id, email, full_name, provider:inv_providers!inv_providers_user_id_fkey(id, onboarding_complete)')
      .eq('role', 'prestataire')
      .eq('is_active', true),
    db.from('inv_invitations').select('user_id, used_at'),
    db
      .from('inv_missions')
      .select('provider_id')
      .gte('start_date', cycle.periodStart)
      .lte('start_date', cycle.periodEnd),
  ])

  const venus = new Set((invitations ?? []).filter((i) => i.used_at).map((i) => i.user_id as string))
  const aDeclare = new Set((missions ?? []).map((m) => m.provider_id as string))

  for (const u of (gens ?? []) as unknown as {
    id: string
    email: string
    full_name: string
    provider: { id: string; onboarding_complete: boolean }[] | { id: string; onboarding_complete: boolean } | null
  }[]) {
    const fiche = Array.isArray(u.provider) ? u.provider[0] : u.provider
    if (!fiche) continue

    // Jamais entré : ni lien consommé, ni fiche complétée.
    if (!venus.has(u.id) && !fiche.onboarding_complete) {
      const ok = await sendInvitation(u.id, auteurId ?? undefined)
      if (ok) out.invites++
      else out.echecs.push(u.email)
      continue
    }

    if (aDeclare.has(fiche.id)) {
      out.ignores++
      continue
    }

    await deliver({
      to: { email: u.email, name: u.full_name },
      ...templates.declarationReminder({
        name: u.full_name,
        deadline: cycle.declarationDeadline,
        label: cycle.label,
      }),
      template: 'declaration_reminder',
      entityType: 'user',
      entityId: u.id,
    })
    out.rappeles++
  }

  // Les managers n'ont rien à déclarer : on leur rappelle de faire remonter
  // les factures qui ne suivent aucune prestation. Et leur date n'est pas
  // celle des déclarations — une facture qu'ils envoient est déjà vérifiée
  // de leur côté — mais celle où toutes les factures doivent être reçues.
  const { data: encadrants } = await db
    .from('inv_users')
    .select('id, email, full_name')
    .in('role', ['manager', 'admin'])
    .eq('is_active', true)

  for (const m of encadrants ?? []) {
    await deliver({
      to: { email: m.email as string, name: m.full_name as string },
      ...templates.managerInvoiceReminder({
        name: m.full_name as string,
        label: cycle.label,
        deadline: cycle.invoiceDeadline,
        adresse: process.env.DEPOT_FACTURES_EMAIL ?? null,
      }),
      template: 'manager_invoice_reminder',
      entityType: 'user',
      entityId: m.id as string,
    })
    out.managers++
  }

  return out
}
