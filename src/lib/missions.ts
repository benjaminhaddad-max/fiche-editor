import type { ReviewMission } from '@/components/validation/ValidationTable'
import type { MissionStatus } from '@/lib/types'
import { createServerSupabase } from '@/lib/supabase/server'

export const MISSION_WITH_RELATIONS = `
  id, detail, start_date, end_date, pricing_type, quantity, unit_amount_ht,
  total_ht, status, submitted_at, manager_approved_at, admin_approved_at,
  rejected_at, rejection_reason,
  category:inv_categories(name, provider_label),
  provider:inv_providers(legal_name),
  manager:inv_users!inv_missions_manager_id_fkey(full_name)
`

interface RawMission {
  id: string
  detail: string
  start_date: string
  end_date: string | null
  pricing_type: ReviewMission['pricing_type']
  quantity: number
  unit_amount_ht: number
  total_ht: number
  category: { name: string; provider_label: string | null } | null
  provider: { legal_name: string } | null
  manager: { full_name: string } | null
}

export function toReviewMission(row: RawMission): ReviewMission {
  return {
    id: row.id,
    detail: row.detail,
    start_date: row.start_date,
    end_date: row.end_date,
    pricing_type: row.pricing_type,
    quantity: Number(row.quantity),
    unit_amount_ht: Number(row.unit_amount_ht),
    total_ht: Number(row.total_ht),
    category_name: row.category?.name ?? '—',
    provider_name: row.provider?.legal_name ?? '—',
    manager_name: row.manager?.full_name ?? '—',
  }
}

/** Prestations dans un etat donne, avec toutes les relations d'affichage. */
export async function getMissionsByStatus(
  statuses: MissionStatus[],
  opts: { managerId?: string } = {}
): Promise<ReviewMission[]> {
  const supabase = await createServerSupabase()
  let query = supabase
    .from('inv_missions')
    .select(MISSION_WITH_RELATIONS)
    .in('status', statuses)
    .order('start_date', { ascending: true })

  if (opts.managerId) query = query.eq('manager_id', opts.managerId)

  const { data, error } = await query
  if (error) {
    console.error('[getMissionsByStatus]', error.message)
    return []
  }
  return (data as unknown as RawMission[]).map(toReviewMission)
}
