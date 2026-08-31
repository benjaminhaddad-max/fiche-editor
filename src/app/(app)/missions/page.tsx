import Link from 'next/link'
import { Plus } from 'lucide-react'
import { MissionStatusBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, EmptyState, PageHeader, StatTile } from '@/components/ui/Page'
import { MissionRowActions } from '@/components/missions/MissionRowActions'
import { requireProvider } from '@/lib/auth'
import { formatPeriod, money } from '@/lib/format'
import { createServerSupabase } from '@/lib/supabase/server'
import type { Mission } from '@/lib/types'

type MissionRow = Mission & {
  category: { name: string; provider_label: string | null } | null
  manager: { full_name: string } | null
  invoice: { number: string } | null
}

export default async function MissionsPage() {
  const { provider } = await requireProvider()
  const supabase = await createServerSupabase()

  const { data } = await supabase
    .from('inv_missions')
    .select(
      `*,
       category:inv_categories(name, provider_label),
       manager:inv_users!inv_missions_manager_id_fkey(full_name),
       invoice:inv_invoices(number)`
    )
    .eq('provider_id', provider.id)
    .order('start_date', { ascending: false })

  const missions = (data ?? []) as MissionRow[]

  const pending = missions.filter((m) =>
    ['submitted', 'manager_approved'].includes(m.status)
  )
  const invoiceable = missions.filter((m) => m.status === 'approved')
  const invoiceableTotal = invoiceable.reduce((sum, m) => sum + Number(m.total_ht), 0)

  return (
    <>
      <PageHeader
        title="Mes prestations"
        description="Déclarez vos missions, suivez leur validation, puis générez votre facture."
        actions={
          <Link href="/missions/new">
            <Button>
              <Plus size={16} />
              Déclarer une prestation
            </Button>
          </Link>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile
          label="En attente de validation"
          value={String(pending.length)}
          sub={pending.length ? money(pending.reduce((s, m) => s + Number(m.total_ht), 0)) : '—'}
          accent="amber"
        />
        <StatTile
          label="Validées, à facturer"
          value={money(invoiceableTotal)}
          sub={`${invoiceable.length} prestation${invoiceable.length > 1 ? 's' : ''}`}
          accent="emerald"
        />
        <StatTile
          label="Total déclaré"
          value={money(missions.reduce((s, m) => s + Number(m.total_ht), 0))}
          sub={`${missions.length} prestation${missions.length > 1 ? 's' : ''}`}
        />
      </div>

      {invoiceable.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-emerald-900">
              {invoiceable.length} prestation{invoiceable.length > 1 ? 's' : ''} validée
              {invoiceable.length > 1 ? 's' : ''} — {money(invoiceableTotal)} HT
            </p>
            <p className="mt-0.5 text-xs text-emerald-700">
              Vous pouvez générer votre facture : elle reprendra exactement ces montants.
            </p>
          </div>
          <Link href="/factures/nouvelle">
            <Button variant="success">Générer ma facture</Button>
          </Link>
        </div>
      )}

      {missions.length === 0 ? (
        <EmptyState
          title="Aucune prestation déclarée"
          description="Commencez par déclarer une mission réalisée pour Diploma Santé. Elle sera validée par votre donneur d’ordre avant d’être facturable."
          action={
            <Link href="/missions/new">
              <Button>
                <Plus size={16} />
                Déclarer une prestation
              </Button>
            </Link>
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Période</th>
                  <th className="px-4 py-3 font-medium">Prestation</th>
                  <th className="px-4 py-3 font-medium">Donneur d’ordre</th>
                  <th className="px-4 py-3 text-right font-medium">Montant HT</th>
                  <th className="px-4 py-3 font-medium">Statut</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {missions.map((m) => (
                  <tr key={m.id} className="align-top hover:bg-slate-50/70">
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {formatPeriod(m.start_date, m.end_date)}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{m.detail}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {m.category?.provider_label || m.category?.name}
                      </p>
                      {m.status === 'rejected' && m.rejection_reason && (
                        <p className="mt-1.5 rounded bg-red-50 px-2 py-1 text-xs text-red-700">
                          Motif du refus : {m.rejection_reason}
                        </p>
                      )}
                      {m.invoice && (
                        <p className="mt-0.5 text-xs text-slate-400">
                          Facture {m.invoice.number}
                        </p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {m.manager?.full_name ?? '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-slate-900">
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
      )}
    </>
  )
}
