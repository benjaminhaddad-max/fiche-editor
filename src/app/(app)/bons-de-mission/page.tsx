import Link from 'next/link'
import { OrderStatusBadge } from '@/components/ui/Badge'
import { NewOrderForm } from '@/components/orders/OrderForms'
import { Card, EmptyState, PageHeader } from '@/components/ui/Page'
import { Tabs } from '@/components/ui/Tabs'
import { requireRole } from '@/lib/auth'
import { todayParis } from '@/lib/cycle'
import { formatPeriod, money } from '@/lib/format'
import { getActiveProviders, getCategoriesWithPole } from '@/lib/queries'
import { createServerSupabase } from '@/lib/supabase/server'
import type { MissionOrder } from '@/lib/types'

type Row = MissionOrder & {
  provider: { legal_name: string } | null
  manager: { full_name: string } | null
}

export default async function BonsDeMissionPage({
  searchParams,
}: {
  searchParams: Promise<{ onglet?: string }>
}) {
  const { onglet } = await searchParams
  const user = await requireRole('manager', 'admin')
  const today = todayParis()
  const supabase = await createServerSupabase()

  let q = supabase
    .from('inv_mission_orders')
    .select('*, provider:inv_providers(legal_name), manager:inv_users!inv_mission_orders_manager_id_fkey(full_name)')
    .order('end_date', { ascending: true })
  if (user.role === 'manager') q = q.eq('manager_id', user.id)

  const [{ data }, providers, categories] = await Promise.all([q, getActiveProviders(), getCategoriesWithPole()])
  const bons = (data ?? []) as unknown as Row[]

  const groupes = {
    'a-cloturer': bons.filter((b) => b.status === 'accepted' && b.end_date <= today),
    'en-cours': bons.filter((b) => b.status === 'accepted' && b.end_date > today),
    attente: bons.filter((b) => b.status === 'sent'),
    termines: bons.filter((b) => ['done', 'declined', 'cancelled'].includes(b.status)).reverse(),
  }
  const courant = (onglet && onglet in groupes ? onglet : onglet === 'nouveau' ? 'nouveau' : groupes['a-cloturer'].length ? 'a-cloturer' : 'nouveau') as keyof typeof groupes | 'nouveau'
  const liste = courant === 'nouveau' ? [] : groupes[courant]

  return (
    <>
      <PageHeader
        title="Bons de mission"
        description="Proposez une mission avec son tarif et ses conditions. Acceptée, puis clôturée à la date de fin, elle rejoint les prestations déclarées sans ressaisie."
      />
      <Tabs
        current={courant}
        items={[
          { key: 'nouveau', label: 'Nouveau bon', href: '/bons-de-mission?onglet=nouveau' },
          { key: 'a-cloturer', label: 'À clôturer', href: '/bons-de-mission?onglet=a-cloturer', count: groupes['a-cloturer'].length },
          { key: 'en-cours', label: 'En cours', href: '/bons-de-mission?onglet=en-cours', count: groupes['en-cours'].length },
          { key: 'attente', label: 'En attente de réponse', href: '/bons-de-mission?onglet=attente', count: groupes.attente.length },
          { key: 'termines', label: 'Terminés', href: '/bons-de-mission?onglet=termines' },
        ]}
      />

      {courant === 'nouveau' ? (
        <Card className="p-5">
          <NewOrderForm providers={providers} categories={categories} today={today} />
        </Card>
      ) : liste.length === 0 ? (
        <EmptyState title="Rien ici" />
      ) : (
        <Card className="divide-y divide-line/60 overflow-hidden">
          {liste.map((b) => (
            <Link
              key={b.id}
              href={`/bons-de-mission/${b.id}`}
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 hover:bg-cream-muted"
            >
              <div>
                <p className="text-sm font-medium text-navy">{b.title}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {b.provider?.legal_name} · {formatPeriod(b.start_date, b.end_date)}
                  {user.role === 'admin' && ` · ${b.manager?.full_name}`}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <OrderStatusBadge status={b.status} />
                <span className="w-24 text-right text-sm font-semibold text-navy">{money(b.total_ht)}</span>
              </div>
            </Link>
          ))}
        </Card>
      )}
    </>
  )
}
