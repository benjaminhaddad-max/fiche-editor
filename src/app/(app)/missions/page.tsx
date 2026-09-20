import Link from 'next/link'
import { Plus } from 'lucide-react'
import { CalendrierMois } from '@/components/cycle/CalendrierMois'
import { MissionRowActions } from '@/components/missions/MissionRowActions'
import { OrderAnswer } from '@/components/orders/OrderAnswer'
import { Badge, MissionStatusBadge, OrderStatusBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, EmptyState, PageHeader, StatTile } from '@/components/ui/Page'
import type { TabItem } from '@/components/ui/Tabs'
import { requireProvider } from '@/lib/auth'
import { cycleForDate } from '@/lib/cycle'
import { formatDate, formatPeriod, money } from '@/lib/format'
import { POLE_LABEL, PRICING_UNIT } from '@/lib/labels'
import { createServerSupabase } from '@/lib/supabase/server'
import { POLES, isSalaried, type Mission, type MissionOrder, type Pole } from '@/lib/types'

type MissionRow = Mission & {
  category: { name: string; provider_label: string | null; pole: Pole } | null
  manager: { full_name: string } | null
  invoice: { number: string } | null
}

type OrderRow = MissionOrder & {
  category: { name: string; pole: Pole } | null
  manager: { full_name: string } | null
}

export default async function MissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ onglet?: string }>
}) {
  const { onglet } = await searchParams
  const { provider } = await requireProvider()
  const salarie = isSalaried(provider.employment_type)
  const supabase = await createServerSupabase()

  const [{ data: mData }, { data: oData }, { data: cData }] = await Promise.all([
    supabase
      .from('inv_missions')
      .select(
        `*,
         category:inv_categories(name, provider_label, pole),
         manager:inv_users!inv_missions_manager_id_fkey(full_name),
         invoice:inv_invoices(number)`
      )
      .eq('provider_id', provider.id)
      .order('start_date', { ascending: false }),
    supabase
      .from('inv_mission_orders')
      .select(
        `*, category:inv_categories(name, pole),
         manager:inv_users!inv_mission_orders_manager_id_fkey(full_name)`
      )
      .eq('provider_id', provider.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('inv_coaching_contracts')
      .select('contract_type')
      .eq('provider_id', provider.id)
      .neq('status', 'cancelled'),
  ])

  const missions = (mData ?? []) as MissionRow[]
  const orders = (oData ?? []) as OrderRow[]
  const aRepondre = orders.filter((o) => o.status === 'sent')

  // Un onglet par pôle où la personne a une activité ou un contrat.
  const polesActifs = new Set<Pole>([
    ...missions.map((m) => m.category?.pole ?? 'autres'),
    ...((cData ?? []) as { contract_type: Pole }[]).map((c) => c.contract_type),
  ])
  const onglets: TabItem[] = [
    { key: 'tout', label: 'Tout', href: '/missions', count: undefined },
    ...POLES.filter((p) => polesActifs.has(p)).map((p) => ({
      key: p,
      label: POLE_LABEL[p],
      href: `/missions?onglet=${p}`,
      count: missions.filter((m) => (m.category?.pole ?? 'autres') === p && ['draft', 'rejected'].includes(m.status)).length,
    })),
    { key: 'bons', label: 'Bons de mission', href: '/missions?onglet=bons', count: aRepondre.length },
  ]
  const courant = onglets.some((o) => o.key === onglet) ? onglet! : 'tout'

  const visibles =
    courant === 'tout' ? missions : missions.filter((m) => (m.category?.pole ?? 'autres') === courant)

  const enAttente = missions.filter((m) => ['submitted', 'manager_approved'].includes(m.status))
  const facturables = missions.filter((m) => m.status === 'approved')
  const totalFacturable = facturables.reduce((s, m) => s + Number(m.total_ht), 0)

  // Regroupement par mois : c'est l'unité du bordereau.
  const parMois = new Map<string, MissionRow[]>()
  for (const m of visibles) {
    const k = m.start_date.slice(0, 7)
    parMois.set(k, [...(parMois.get(k) ?? []), m])
  }

  return (
    <>
      <PageHeader
        title="Mes prestations"
        description={
          salarie
            ? 'Déclarez vos prestations et vos bonus chaque mois : ils partent au service paie une fois validés.'
            : 'Déclarez vos missions, suivez leur validation ; le bordereau du mois les réunit toutes pour votre facture.'
        }
        actions={
          <Link href="/missions/new" className="ds-header-action">
            <Plus size={16} />
            Déclarer
          </Link>
        }
        tabs={onglets}
        currentTab={courant}
      />

      <CalendrierMois pour={salarie ? 'salarie' : 'prestataire'} />

      {aRepondre.length > 0 && courant !== 'bons' && (
        <Link
          href="/missions?onglet=bons"
          className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-gold/40 bg-gold/10 px-5 py-3.5 text-sm text-navy hover:bg-gold/15"
        >
          <span>
            <strong>{aRepondre.length} bon{aRepondre.length > 1 ? 's' : ''} de mission</strong> attend
            {aRepondre.length > 1 ? 'ent' : ''} votre réponse.
          </span>
          <span className="font-medium text-gold-dark">Répondre →</span>
        </Link>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile
          label="En validation"
          value={String(enAttente.length)}
          sub={enAttente.length ? money(enAttente.reduce((s, m) => s + Number(m.total_ht), 0)) : '—'}
          accent="amber"
        />
        <StatTile
          label={salarie ? 'Validées, pour la paie' : 'Validées, à facturer'}
          value={money(totalFacturable)}
          sub={`${facturables.length} ligne${facturables.length > 1 ? 's' : ''}`}
          accent="emerald"
        />
        <StatTile
          label="Bons de mission en cours"
          value={String(orders.filter((o) => o.status === 'accepted').length)}
          sub={aRepondre.length ? `${aRepondre.length} à accepter` : '—'}
        />
      </div>

      {courant === 'bons' ? (
        orders.length === 0 ? (
          <EmptyState
            title="Aucun bon de mission"
            description="Quand un manager vous propose une mission avec un tarif et des conditions, elle apparaît ici pour que vous l’acceptiez."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {orders.map((o) => (
              <Card key={o.id} className="flex flex-wrap items-start justify-between gap-4 p-5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-navy">{o.title}</p>
                    <OrderStatusBadge status={o.status} />
                    {o.category && <Badge className="bg-cream-deep text-navy/70 ring-line">{POLE_LABEL[o.category.pole]}</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-navy/70">
                    {o.manager?.full_name} · {formatPeriod(o.start_date, o.end_date)} ·{' '}
                    {Number(o.quantity)} {PRICING_UNIT[o.pricing_type]} × {money(o.unit_amount_ht)} ={' '}
                    <strong className="text-navy">{money(o.total_ht)} HT</strong>
                  </p>
                  {o.conditions && <p className="mt-2 whitespace-pre-line text-sm text-navy/80">{o.conditions}</p>}
                  {o.provider_note && (
                    <p className="mt-2 text-xs text-muted">Votre réponse : {o.provider_note}</p>
                  )}
                  {o.status === 'accepted' && (
                    <p className="mt-2 text-xs text-muted">
                      À la fin de la mission ({formatDate(o.end_date)}), votre manager la confirme : elle rejoint alors vos prestations automatiquement.
                    </p>
                  )}
                </div>
                {o.status === 'sent' && <OrderAnswer orderId={o.id} />}
              </Card>
            ))}
          </div>
        )
      ) : visibles.length === 0 ? (
        <EmptyState
          title="Aucune prestation ici"
          description="Déclarez vos missions du mois : une ligne par prestation, comme sur une facture."
          action={
            <Link href="/missions/new">
              <Button>
                <Plus size={16} />
                Déclarer
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          {[...parMois.entries()].map(([mois, lignes]) => (
            <section key={mois}>
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="text-sm font-semibold capitalize text-navy">{cycleForDate(`${mois}-01`).label}</h2>
                <span className="text-sm text-navy/70">
                  {money(lignes.reduce((s, m) => s + Number(m.total_ht), 0))} HT
                </span>
              </div>
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-line bg-cream-muted text-left text-xs uppercase tracking-wide text-muted">
                      <tr>
                        <th className="px-4 py-2.5 font-medium">Date</th>
                        <th className="px-4 py-2.5 font-medium">Prestation</th>
                        <th className="px-4 py-2.5 font-medium">Manager</th>
                        <th className="px-4 py-2.5 text-right font-medium">Montant HT</th>
                        <th className="px-4 py-2.5 font-medium">Statut</th>
                        <th className="px-4 py-2.5" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/60">
                      {lignes.map((m) => (
                        <tr key={m.id} className="align-top hover:bg-cream-muted">
                          <td className="whitespace-nowrap px-4 py-3 text-navy/70">
                            {formatPeriod(m.start_date, m.end_date)}
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-medium text-navy">
                              {m.kind === 'bonus' && (
                                <Badge className="mr-1.5 bg-gold/15 text-gold-dark ring-gold/30">Bonus</Badge>
                              )}
                              {m.detail}
                            </p>
                            <p className="mt-0.5 text-xs text-muted">
                              {m.category?.provider_label || m.category?.name}
                              {m.kind !== 'bonus' && ` · ${Number(m.quantity)} ${PRICING_UNIT[m.pricing_type]} × ${money(m.unit_amount_ht)}`}
                              {m.origin === 'manager' && ' · saisie par votre manager'}
                              {m.origin === 'order' && ' · bon de mission'}
                              {m.origin === 'contract' && ' · échéance de contrat'}
                            </p>
                            {m.status === 'rejected' && m.rejection_reason && (
                              <p className="mt-1.5 rounded bg-red-50 px-2 py-1 text-xs text-red-700">
                                Motif du refus : {m.rejection_reason}
                              </p>
                            )}
                            {m.invoice && <p className="mt-0.5 text-xs text-stone">Facture {m.invoice.number}</p>}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-navy/70">{m.manager?.full_name ?? '—'}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-navy">
                            {money(m.total_ht)}
                          </td>
                          <td className="px-4 py-3">
                            <MissionStatusBadge status={m.status} />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <MissionRowActions id={m.id} status={m.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </section>
          ))}
        </div>
      )}
    </>
  )
}
