import type { BillingCycle } from '@/lib/cycle'
import { deliver, sendInvitation } from '@/lib/email/notify'
import { guideNom, guidePdf } from '@/lib/guides/pdf'
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
 * Quelqu'un qui n'est jamais entré reçoit deux messages : le lien pour
 * créer son mot de passe, puis le calendrier du mois — l'un sans l'autre
 * ne sert à rien, il entrerait sans savoir ce qu'on attend de lui. Les
 * autres reçoivent la date limite, sauf ceux qui ont déjà tout déclaré.
 * Les managers, eux, reçoivent la date de réception des factures, et le
 * calendrier aussi s'ils découvrent la plateforme.
 */
export async function relancerDeclarations(
  cycle: BillingCycle,
  auteurId: string | null,
  /** Restreint la relance aux prestataires de ce manager. */
  pourManager?: string
): Promise<Relance> {
  const db = createServiceClient()
  const out: Relance = { rappeles: 0, invites: 0, ignores: 0, managers: 0, echecs: [] }

  // Un manager ne relance que les siens : ceux qui lui sont rattachés par
  // défaut, et ceux dont il a déjà validé une prestation.
  let siens: Set<string> | null = null
  if (pourManager) {
    const [{ data: parDefaut }, { data: parMission }] = await Promise.all([
      db.from('inv_providers').select('id').eq('default_manager_id', pourManager),
      db.from('inv_missions').select('provider_id').eq('manager_id', pourManager),
    ])
    siens = new Set([
      ...(parDefaut ?? []).map((f) => f.id as string),
      ...(parMission ?? []).map((m) => m.provider_id as string),
    ])
  }

  const [{ data: gens }, { data: invitations }, { data: missions }] = await Promise.all([
    db
      .from('inv_users')
      .select('id, email, full_name, provider:inv_providers!inv_providers_user_id_fkey(id, onboarding_complete, employment_type)')
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
    provider:
      | { id: string; onboarding_complete: boolean; employment_type: string }[]
      | { id: string; onboarding_complete: boolean; employment_type: string }
      | null
  }[]) {
    const fiche = Array.isArray(u.provider) ? u.provider[0] : u.provider
    if (!fiche) continue
    if (siens && !siens.has(fiche.id)) continue

    // Jamais entré : ni lien consommé, ni fiche complétée.
    if (!venus.has(u.id) && !fiche.onboarding_complete) {
      const ok = await sendInvitation(u.id, auteurId ?? undefined)
      if (!ok) {
        out.echecs.push(u.email)
        continue
      }
      const pour = fiche.employment_type === 'independant' ? 'prestataire' : 'salarie'
      await deliver({
        to: { email: u.email, name: u.full_name },
        ...templates.monthCalendar({ name: u.full_name, public: pour, cycle }),
        template: 'month_calendar',
        attachments: [{ name: guideNom(pour), content: (await guidePdf(pour, cycle)).toString('base64') }],
        entityType: 'user',
        entityId: u.id,
      })
      out.invites++
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
  const { data: encadrants } = pourManager
    ? { data: [] }
    : await db
        .from('inv_users')
        .select('id, email, full_name')
        .in('role', ['manager', 'admin'])
        .eq('is_active', true)

  for (const m of encadrants ?? []) {
    if (!venus.has(m.id as string)) {
      const ok = await sendInvitation(m.id as string, auteurId ?? undefined)
      if (!ok) out.echecs.push(m.email as string)
      else {
        await deliver({
          to: { email: m.email as string, name: m.full_name as string },
          ...templates.monthCalendar({ name: m.full_name as string, public: 'manager', cycle }),
          template: 'month_calendar',
          attachments: [{ name: guideNom('manager'), content: (await guidePdf('manager', cycle)).toString('base64') }],
          entityType: 'user',
          entityId: m.id as string,
        })
        out.invites++
      }
    }
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
