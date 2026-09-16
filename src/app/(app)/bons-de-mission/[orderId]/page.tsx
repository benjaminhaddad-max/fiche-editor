import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { CloseOrderForm } from '@/components/orders/OrderForms'
import { OrderStatusBadge } from '@/components/ui/Badge'
import { Card, PageHeader } from '@/components/ui/Page'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { requireRole } from '@/lib/auth'
import { todayParis } from '@/lib/cycle'
import { formatDate, formatPeriod, money } from '@/lib/format'
import { POLE_LABEL, PRICING_UNIT } from '@/lib/labels'
import { createServerSupabase } from '@/lib/supabase/server'
import type { MissionOrder, Pole } from '@/lib/types'
import { annulerBon } from '../actions'

export default async function BonPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params
  const user = await requireRole('manager', 'admin')
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('inv_mission_orders')
    .select(
      `*, provider:inv_providers(legal_name),
       manager:inv_users!inv_mission_orders_manager_id_fkey(full_name),
       category:inv_categories(name, pole)`
    )
    .eq('id', orderId)
    .maybeSingle()
  if (!data) notFound()
  const b = data as unknown as MissionOrder & {
    provider: { legal_name: string } | null
    manager: { full_name: string } | null
    category: { name: string; pole: Pole } | null
  }
  const aMoi = user.role === 'admin' || b.manager_id === user.id
  const echu = b.end_date <= todayParis()

  return (
    <>
      <Link href="/bons-de-mission" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-navy">
        <ArrowLeft size={15} />
        Bons de mission
      </Link>
      <PageHeader title={b.title} description={`${b.provider?.legal_name ?? '—'} · proposé par ${b.manager?.full_name ?? '—'}`} />

      <Card className="mb-6 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <OrderStatusBadge status={b.status} />
          {b.category && (
            <span className="text-sm text-navy/70">
              {POLE_LABEL[b.category.pole]} · {b.category.name}
            </span>
          )}
        </div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted">Période</dt>
            <dd className="font-medium text-navy">{formatPeriod(b.start_date, b.end_date)}</dd>
          </div>
          <div>
            <dt className="text-muted">Tarif</dt>
            <dd className="font-medium text-navy">
              {Number(b.quantity)} {PRICING_UNIT[b.pricing_type]} × {money(b.unit_amount_ht)}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Total prévu</dt>
            <dd className="font-semibold text-navy">{money(b.total_ht)} HT</dd>
          </div>
        </dl>
        {b.conditions && <p className="mt-4 whitespace-pre-line text-sm text-navy/80">{b.conditions}</p>}
        {b.responded_at && (
          <p className="mt-4 text-xs text-muted">
            Réponse le {formatDate(b.responded_at)}
            {b.provider_note ? ` : « ${b.provider_note} »` : ''}
          </p>
        )}
        {b.status === 'done' && b.mission_id && (
          <p className="mt-4 text-sm text-emerald-700">Clôturé le {formatDate(b.done_at)} : la prestation est dans les prestations déclarées.</p>
        )}
      </Card>

      {aMoi && b.status === 'accepted' && (
        <Card className="mb-6 p-5">
          <h2 className="mb-1 text-sm font-semibold text-navy">
            {echu ? 'La mission est-elle terminée ?' : `Clôture prévue le ${formatDate(b.end_date)}`}
          </h2>
          <p className="mb-4 text-xs text-muted">
            Confirmez ce qui a été réalisé : la prestation rejoint les déclarations du mois, déjà validée par vous.
          </p>
          <CloseOrderForm
            orderId={b.id}
            title={b.title}
            quantity={Number(b.quantity)}
            unit={Number(b.unit_amount_ht)}
            unitLabel={PRICING_UNIT[b.pricing_type]}
          />
        </Card>
      )}

      {aMoi && ['sent', 'accepted'].includes(b.status) && (
        <form action={annulerBon} className="flex justify-end">
          <input type="hidden" name="order_id" value={b.id} />
          <SubmitButton variant="ghost" size="sm" pendingLabel="…">
            Annuler ce bon de mission
          </SubmitButton>
        </form>
      )}
    </>
  )
}
