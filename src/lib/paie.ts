import { createServiceClient } from '@/lib/supabase/service'
import type { Employment, MissionKind } from '@/lib/types'

export interface LignePaie {
  id: string
  personne: string
  statut: Employment
  kind: MissionKind
  detail: string
  date: string
  quantity: number
  unit: number
  total: number
  /** Brut ou net : la paie doit savoir ce qu'elle lit. */
  base: 'brut' | 'net'
  /** Pourcentage retiré du montant convenu, du fait du contrat. */
  abattement: number
  categorie: string
  manager: string
  status: string
}

/**
 * Éléments de paie d'un mois : prestations et bonus des vacataires et
 * alternants, validés ou en cours de validation, pas encore envoyés.
 */
export async function lignesPaie(debut: string, fin: string, opts: { avecEnvoyees?: boolean } = {}): Promise<LignePaie[]> {
  const db = createServiceClient()
  let q = db
    .from('inv_missions')
    .select(
      `id, kind, detail, start_date, quantity, unit_amount_ht, total_ht, abatement_rate, status, pay_basis, payroll_batch_id,
       provider:inv_providers!inner(legal_name, employment_type),
       category:inv_categories(name),
       manager:inv_users!inv_missions_manager_id_fkey(full_name)`
    )
    .neq('provider.employment_type', 'independant')
    .gte('start_date', debut)
    .lte('start_date', fin)
    .in('status', ['submitted', 'manager_approved', 'approved', 'invoiced'])
    .order('start_date')
  if (!opts.avecEnvoyees) q = q.is('payroll_batch_id', null)
  const { data } = await q
  return ((data ?? []) as unknown as {
    id: string
    kind: MissionKind
    detail: string
    start_date: string
    quantity: number
    unit_amount_ht: number
    total_ht: number
    status: string
    pay_basis: 'brut' | 'net' | null
    abatement_rate: number
    provider: { legal_name: string; employment_type: Employment }
    category: { name: string } | null
    manager: { full_name: string } | null
  }[])
    .map((m) => ({
      id: m.id,
      personne: m.provider.legal_name,
      statut: m.provider.employment_type,
      kind: m.kind,
      detail: m.detail,
      date: m.start_date,
      quantity: Number(m.quantity),
      unit: Number(m.unit_amount_ht),
      total: Number(m.total_ht),
      base: (m.pay_basis === 'net' ? 'net' : 'brut') as 'brut' | 'net',
      abattement: Number(m.abatement_rate ?? 0),
      categorie: m.category?.name ?? '—',
      manager: m.manager?.full_name ?? '—',
      status: m.status,
    }))
    .sort((a, b) => a.personne.localeCompare(b.personne, 'fr') || a.date.localeCompare(b.date))
}
