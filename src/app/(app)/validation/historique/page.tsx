import { MissionStatusBadge } from '@/components/ui/Badge'
import { Card, EmptyState, PageHeader } from '@/components/ui/Page'
import { requireRole } from '@/lib/auth'
import { formatDate, formatPeriod, money } from '@/lib/format'
import { MISSION_WITH_RELATIONS } from '@/lib/missions'
import { createServerSupabase } from '@/lib/supabase/server'
import type { MissionStatus } from '@/lib/types'

interface Row {
  id: string
  detail: string
  start_date: string
  end_date: string | null
  total_ht: number
  status: MissionStatus
  manager_approved_at: string | null
  rejected_at: string | null
  rejection_reason: string | null
  category: { name: string } | null
  provider: { legal_name: string } | null
}

export default async function HistoriquePage() {
  const user = await requireRole('manager', 'admin')
  const supabase = await createServerSupabase()

  let query = supabase
    .from('inv_missions')
    .select(MISSION_WITH_RELATIONS)
    .in('status', ['manager_approved', 'approved', 'rejected', 'invoiced'])
    .order('start_date', { ascending: false })
    .limit(200)

  if (user.role === 'manager') query = query.eq('manager_id', user.id)

  const { data } = await query
  const rows = (data ?? []) as unknown as Row[]

  return (
    <>
      <PageHeader
        title="Historique"
        description="Les prestations que vous avez déjà traitées."
      />

      {rows.length === 0 ? (
        <EmptyState title="Aucune prestation traitée pour l’instant" />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-cream-muted text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Prestataire</th>
                  <th className="px-4 py-3 font-medium">Prestation</th>
                  <th className="px-4 py-3 font-medium">Période</th>
                  <th className="px-4 py-3 text-right font-medium">Montant HT</th>
                  <th className="px-4 py-3 font-medium">Décision</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {rows.map((m) => (
                  <tr key={m.id} className="align-top">
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-navy">
                      {m.provider?.legal_name ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-navy">{m.detail}</p>
                      <p className="mt-0.5 text-xs text-muted">{m.category?.name}</p>
                      {m.status === 'rejected' && m.rejection_reason && (
                        <p className="mt-1 text-xs text-red-600">{m.rejection_reason}</p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-navy/70">
                      {formatPeriod(m.start_date, m.end_date)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-navy">
                      {money(m.total_ht)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <MissionStatusBadge status={m.status} />
                      <p className="mt-1 text-xs text-stone">
                        {formatDate(m.rejected_at ?? m.manager_approved_at)}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  )
}
