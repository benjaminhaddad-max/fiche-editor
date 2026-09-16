import { deliver } from '@/lib/email/notify'
import { templates } from '@/lib/email/templates'
import type { BillingCycle } from '@/lib/cycle'
import { round2 } from '@/lib/format'
import { createServiceClient } from '@/lib/supabase/service'
import { isSalaried, type Employment } from '@/lib/types'

export interface EnvoiBordereaux {
  bordereaux: number
  salaries: number
  promues: number
  montant: number
}

/**
 * Établit et envoie le bordereau global du mois : pour chaque prestataire,
 * toutes ses prestations validées, tous pôles et tous managers confondus.
 *
 * Les lignes que le manager a validées pendant la vérification sont
 * considérées comme définitives : la vérification est terminée, il n'y a
 * plus d'étape à attendre. L'administration peut toujours refuser une ligne
 * avant la facture.
 *
 * Un vacataire ou un alternant ne reçoit pas de bordereau à facturer : on le
 * prévient que ses éléments partent à la paie.
 *
 * Idempotent : une prestation déjà rattachée à un bordereau ne l'est pas deux
 * fois, et un bordereau déjà facturé n'est pas rouvert.
 */
export async function envoyerBordereaux(cycle: BillingCycle, auteurId?: string | null): Promise<EnvoiBordereaux> {
  const db = createServiceClient()
  const now = new Date().toISOString()

  // ---- 1. Fin de la vérification : les validations des managers sont acquises.
  const { data: promues } = await db
    .from('inv_missions')
    .update({ status: 'approved', admin_approved_at: now, admin_approved_by: auteurId ?? null })
    .eq('status', 'manager_approved')
    .lte('start_date', cycle.periodEnd)
    .is('invoice_id', null)
    .select('id')

  // ---- 2. Lignes à regrouper.
  const { data: lignes } = await db
    .from('inv_missions')
    .select('id, provider_id, total_ht, provider:inv_providers(employment_type)')
    .eq('status', 'approved')
    .is('invoice_id', null)
    .is('statement_id', null)
    .is('payroll_batch_id', null)
    .lte('start_date', cycle.periodEnd)

  const parPresta = new Map<string, { ids: string[]; total: number; employment: Employment }>()
  for (const l of (lignes ?? []) as unknown as {
    id: string
    provider_id: string
    total_ht: number
    provider: { employment_type: Employment } | null
  }[]) {
    const cur = parPresta.get(l.provider_id) ?? {
      ids: [],
      total: 0,
      employment: l.provider?.employment_type ?? 'independant',
    }
    cur.ids.push(l.id)
    cur.total += Number(l.total_ht)
    parPresta.set(l.provider_id, cur)
  }

  let bordereaux = 0
  let salaries = 0
  let montant = 0

  for (const [providerId, { ids, total, employment }] of parPresta) {
    const { data: p } = await db
      .from('inv_providers')
      .select('user:inv_users!inv_providers_user_id_fkey(email, full_name, is_active)')
      .eq('id', providerId)
      .maybeSingle()
    const dest = (p as unknown as { user: { email: string; full_name: string; is_active: boolean } | null } | null)?.user

    if (isSalaried(employment)) {
      salaries++
      if (dest?.is_active) {
        await deliver({
          to: { email: dest.email, name: dest.full_name },
          ...templates.statementSent({
            providerName: dest.full_name,
            total: round2(total),
            lines: ids.length,
            label: cycle.label,
            deadline: cycle.invoiceDeadline,
            paymentDate: cycle.paymentDate,
            salaried: true,
          }),
          template: 'payroll_notice',
          entityType: 'provider',
          entityId: providerId,
          providerId,
        })
      }
      continue
    }

    const { data: existant } = await db
      .from('inv_statements')
      .select('id, status, total_ht')
      .eq('provider_id', providerId)
      .eq('cycle_month', cycle.month)
      .maybeSingle()
    if (existant?.status === 'invoiced') continue

    const valeurs = {
      provider_id: providerId,
      cycle_month: cycle.month,
      period_start: cycle.periodStart,
      period_end: cycle.periodEnd,
      statement_date: cycle.statementDate,
      invoice_deadline: cycle.invoiceDeadline,
      payment_start: cycle.paymentDate,
      payment_end: cycle.paymentDate,
      status: 'sent',
      total_ht: round2(Number(existant?.total_ht ?? 0) + total),
      sent_at: now,
    }
    const { data: bordereau, error } = existant
      ? await db.from('inv_statements').update(valeurs).eq('id', existant.id).select('id').single()
      : await db.from('inv_statements').insert(valeurs).select('id').single()
    if (error || !bordereau) {
      console.error('[bordereaux]', providerId, error?.message)
      continue
    }

    await db.from('inv_missions').update({ statement_id: bordereau.id }).in('id', ids)

    // Le total fait foi à partir des lignes réellement rattachées.
    const { data: rattachees } = await db
      .from('inv_missions')
      .select('total_ht')
      .eq('statement_id', bordereau.id)
      .eq('status', 'approved')
    valeurs.total_ht = round2((rattachees ?? []).reduce((s, m) => s + Number(m.total_ht), 0))
    await db.from('inv_statements').update({ total_ht: valeurs.total_ht }).eq('id', bordereau.id)

    bordereaux++
    montant += total

    if (dest?.is_active) {
      await deliver({
        to: { email: dest.email, name: dest.full_name },
        ...templates.statementSent({
          providerName: dest.full_name,
          total: round2(valeurs.total_ht),
          lines: ids.length,
          label: cycle.label,
          deadline: cycle.invoiceDeadline,
          paymentDate: cycle.paymentDate,
          salaried: false,
        }),
        template: 'statement_sent',
        entityType: 'invoice',
        entityId: bordereau.id,
        providerId,
      })
    }
  }

  return { bordereaux, salaries, promues: promues?.length ?? 0, montant: round2(montant) }
}
