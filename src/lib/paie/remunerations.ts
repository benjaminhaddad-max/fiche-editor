import type { BillingCycle } from '@/lib/cycle'
import { round2 } from '@/lib/format'
import { createServiceClient } from '@/lib/supabase/service'
import type { Employment } from '@/lib/types'

export interface LigneRemuneration {
  providerId: string
  nom: string
  statut: Employment
  /** Facturé sur le mois (indépendants). */
  facture: number
  /** Déjà réglé sur ces factures. */
  paye: number
  /** Éléments variables transmis à la paie (salariés). */
  variables: number
  /** Coût employeur lu sur le bulletin, quand il est arrivé. */
  cout: number | null
  net: number | null
  bulletin: boolean
  documentId: string | null
}

/**
 * Tout ce que coûte chaque personne sur un mois, quel que soit son statut :
 * factures des indépendants, éléments variables des salariés, et le coût
 * employeur dès que le bulletin est arrivé.
 */
export async function remunerationsDuMois(cycle: BillingCycle): Promise<LigneRemuneration[]> {
  const db = createServiceClient()
  const [{ data: fiches }, { data: factures }, { data: missions }, { data: bulletins }] = await Promise.all([
    db.from('inv_providers').select('id, legal_name, employment_type, user:inv_users!inv_providers_user_id_fkey(full_name, is_active)'),
    db
      .from('inv_invoices')
      .select('provider_id, subtotal_ht, total_ttc, status, period_start, issue_date')
      .gte('issue_date', cycle.periodStart)
      .lte('issue_date', cycle.paymentDate),
    db
      .from('inv_missions')
      .select('provider_id, total_ht, status')
      .gte('start_date', cycle.periodStart)
      .lte('start_date', cycle.periodEnd)
      .in('status', ['approved', 'invoiced', 'manager_approved']),
    db.from('inv_documents').select('id, provider_id, cost_amount, net_amount').eq('kind', 'bulletin').eq('period', cycle.month),
  ])

  const lignes = new Map<string, LigneRemuneration>()
  for (const f of (fiches ?? []) as unknown as {
    id: string
    legal_name: string
    employment_type: Employment
    user: { full_name: string; is_active: boolean } | null
  }[]) {
    if (f.user && !f.user.is_active) continue
    lignes.set(f.id, {
      providerId: f.id,
      nom: f.user?.full_name ?? f.legal_name,
      statut: f.employment_type,
      facture: 0,
      paye: 0,
      variables: 0,
      cout: null,
      net: null,
      bulletin: false,
      documentId: null,
    })
  }

  for (const i of factures ?? []) {
    const l = lignes.get(i.provider_id)
    if (!l) continue
    l.facture += Number(i.total_ttc)
    if (i.status === 'paid') l.paye += Number(i.total_ttc)
  }
  for (const m of missions ?? []) {
    const l = lignes.get(m.provider_id)
    if (!l || l.statut === 'independant') continue
    l.variables += Number(m.total_ht)
  }
  for (const b of bulletins ?? []) {
    const l = lignes.get(b.provider_id)
    if (!l) continue
    l.bulletin = true
    l.documentId = b.id
    l.cout = b.cost_amount === null ? null : Number(b.cost_amount)
    l.net = b.net_amount === null ? null : Number(b.net_amount)
  }

  return [...lignes.values()]
    .map((l) => ({ ...l, facture: round2(l.facture), paye: round2(l.paye), variables: round2(l.variables) }))
    .filter((l) => l.facture || l.variables || l.bulletin || l.statut !== 'independant')
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
}
