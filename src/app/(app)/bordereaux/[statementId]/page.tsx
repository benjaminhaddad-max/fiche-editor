import { notFound } from 'next/navigation'
import { CalendarClock } from 'lucide-react'
import { MissionStatusBadge } from '@/components/ui/Badge'
import { Card, PageHeader } from '@/components/ui/Page'
import { BordereauActions } from '@/components/bordereau/BordereauActions'
import { requireProvider } from '@/lib/auth'
import { formatDate, formatPeriod, money } from '@/lib/format'
import { getManagers, getProviderCategories } from '@/lib/queries'
import { createServerSupabase } from '@/lib/supabase/server'
import type { MissionStatus } from '@/lib/types'
import { accepterBordereau, ajouterAuBordereau, signaler } from '../actions'

interface Ligne {
  id: string
  detail: string
  start_date: string
  end_date: string | null
  total_ht: number
  status: MissionStatus
  origin: string
  manager: { full_name: string } | null
  category: { name: string } | null
}

export default async function BordereauPage({
  params,
}: {
  params: Promise<{ statementId: string }>
}) {
  const { statementId } = await params
  const { provider } = await requireProvider()
  const supabase = await createServerSupabase()

  const { data: bordereau } = await supabase
    .from('inv_statements')
    .select('*')
    .eq('id', statementId)
    .eq('provider_id', provider.id)
    .maybeSingle()

  if (!bordereau) notFound()

  const [{ data: lignesData }, managers, categories] = await Promise.all([
    supabase
      .from('inv_missions')
      .select(
        `id, detail, start_date, end_date, total_ht, status, origin,
         manager:inv_users!inv_missions_manager_id_fkey(full_name),
         category:inv_categories(name)`
      )
      .eq('statement_id', statementId)
      .order('start_date'),
    getManagers(),
    getProviderCategories(),
  ])

  const lignes = (lignesData ?? []) as unknown as Ligne[]

  // Regroupées par responsable : c'est la question que se pose le prestataire
  // quand quelque chose cloche — à qui en parler.
  const parManager = new Map<string, Ligne[]>()
  for (const l of lignes) {
    const k = l.manager?.full_name ?? 'Non attribué'
    parManager.set(k, [...(parManager.get(k) ?? []), l])
  }

  const total = lignes
    .filter((l) => l.status !== 'rejected')
    .reduce((s, l) => s + Number(l.total_ht), 0)
  const modifiable = ['sent', 'contested'].includes(bordereau.status)

  return (
    <>
      <PageHeader
        title={`Bordereau de ${bordereau.cycle_month}`}
        description="Récapitulatif de vos prestations validées. Vérifiez-le avant de facturer."
      />

      <Card className="mb-6 flex flex-wrap items-center gap-x-8 gap-y-2 px-5 py-4 text-sm">
        <span className="flex items-center gap-2 text-slate-500">
          <CalendarClock size={15} />
          Période {formatPeriod(bordereau.period_start, bordereau.period_end)}
        </span>
        <span className="text-slate-600">
          Facture attendue avant le{' '}
          <strong className="text-slate-900">
            {formatDate(bordereau.invoice_expected_at ?? bordereau.invoice_deadline)}
          </strong>
        </span>
        <span className="text-slate-600">
          Paiement {formatDate(bordereau.payment_start)} → {formatDate(bordereau.payment_end)}
        </span>
        <span className="ml-auto text-base font-bold text-slate-900">{money(total)} HT</span>
      </Card>

      {bordereau.provider_comment && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">Votre remarque, transmise aux responsables :</p>
          <p className="mt-1 whitespace-pre-wrap">{bordereau.provider_comment}</p>
        </div>
      )}

      <div className="mb-6 flex flex-col gap-4">
        {[...parManager.entries()].map(([manager, l]) => (
          <Card key={manager} className="overflow-hidden">
            <div className="flex items-baseline justify-between border-b border-slate-200 bg-slate-50 px-5 py-3">
              <p className="text-sm font-semibold text-slate-900">{manager}</p>
              <p className="text-sm text-slate-600">
                {money(l.filter((x) => x.status !== 'rejected').reduce((s, x) => s + Number(x.total_ht), 0))}
              </p>
            </div>
            <ul className="divide-y divide-slate-100">
              {l.map((x) => (
                <li key={x.id} className="flex items-start justify-between gap-4 px-5 py-3">
                  <div>
                    <p className="text-sm text-slate-900">{x.detail}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {formatPeriod(x.start_date, x.end_date)} · {x.category?.name}
                      {x.origin === 'provider' ? ' · ajoutée par vous' : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <MissionStatusBadge status={x.status} />
                    <span className="w-24 text-right text-sm font-semibold text-slate-900">
                      {money(x.total_ht)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>

      <BordereauActions
        statementId={statementId}
        deadline={bordereau.invoice_expected_at ?? bordereau.invoice_deadline}
        paiement={bordereau.payment_start}
        managers={managers}
        categories={categories}
        defaultManagerId={provider.default_manager_id}
        signalerAction={signaler}
        ajouterAction={ajouterAuBordereau}
        accepterAction={accepterBordereau}
        modifiable={modifiable}
      />
    </>
  )
}
