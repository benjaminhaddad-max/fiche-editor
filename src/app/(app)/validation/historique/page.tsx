import { MissionStatusBadge } from '@/components/ui/Badge'
import { HistoriqueAdmin } from '@/components/prestations/HistoriqueAdmin'
import { Suspense } from 'react'
import { PrestationsNav } from '@/components/prestations/PrestationsNav'
import { RecherchePrestataire } from '@/components/prestations/RecherchePrestataire'
import { correspondPrestataire } from '@/lib/recherche-prestataire'
import { Card, EmptyState } from '@/components/ui/Page'
import { requireRole } from '@/lib/auth'
import { formatDate, formatPeriod, money } from '@/lib/format'
import { MISSION_WITH_RELATIONS } from '@/lib/missions'
import { createServerSupabase } from '@/lib/supabase/server'
import type { MissionStatus } from '@/lib/types'
import { getBrandId } from '@/lib/brand'

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

export default async function HistoriquePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const user = await requireRole('manager', 'admin')
  if (user.role === 'admin') {
    return (
      <>
        <PrestationsNav
          user={user}
          current="historique"
          description="Toutes les prestations, filtrables par mois, prestataire, catégorie et statut."
        />
        <HistoriqueAdmin f={await searchParams} />
      </>
    )
  }
  const supabase = await createServerSupabase()
  const cherche = ((await searchParams).q ?? '').trim()

  // Recherche d'un prestataire : filtrée en base, sinon le plafond de 200
  // lignes cacherait ses prestations les plus anciennes.
  let trouves: string[] | null = null
  if (cherche) {
    const { data: provs } = await supabase
      .from('inv_providers')
      .select('id, legal_name')
      .eq('brand', getBrandId())
    trouves = (provs ?? []).filter((p) => correspondPrestataire(p.legal_name, cherche)).map((p) => p.id)
  }

  let query = supabase
    .from('inv_missions')
    .select(MISSION_WITH_RELATIONS)
    .eq('brand', getBrandId())
    .in('status', ['manager_approved', 'approved', 'rejected', 'invoiced'])
    .order('start_date', { ascending: false })
    .limit(200)

  if (user.role === 'manager') query = query.eq('manager_id', user.id)
  if (trouves) query = query.in('provider_id', trouves.length ? trouves : ['00000000-0000-0000-0000-000000000000'])

  const { data } = await query
  const rows = (data ?? []) as unknown as Row[]

  return (
    <>
      <PrestationsNav user={user} current="historique" description="Les prestations que vous avez déjà traitées." />

      <Suspense fallback={null}>
        <RecherchePrestataire className="mb-4" />
      </Suspense>

      {rows.length === 0 ? (
        <EmptyState
          title={cherche ? `Aucune prestation traitée pour « ${cherche} »` : 'Aucune prestation traitée pour l’instant'}
        />
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
