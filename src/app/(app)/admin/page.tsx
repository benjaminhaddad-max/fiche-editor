import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { Card, PageHeader, StatTile } from '@/components/ui/Page'
import { InvoiceStatusBadge } from '@/components/ui/Badge'
import { requireRole } from '@/lib/auth'
import { formatDate, money } from '@/lib/format'
import { createServerSupabase } from '@/lib/supabase/server'

export default async function AdminDashboard() {
  await requireRole('admin')
  const supabase = await createServerSupabase()

  const [missions, invoices, providers] = await Promise.all([
    supabase.from('inv_missions').select('status, total_ht'),
    supabase
      .from('inv_invoices')
      .select('id, number, status, issue_date, total_ttc, pennylane_status, provider:inv_providers(legal_name)')
      .order('issue_date', { ascending: false })
      .limit(8),
    supabase.from('inv_providers').select('id', { count: 'exact', head: true }),
  ])

  const allMissions = (missions.data ?? []) as { status: string; total_ht: number }[]
  const sum = (statuses: string[]) =>
    allMissions
      .filter((m) => statuses.includes(m.status))
      .reduce((s, m) => s + Number(m.total_ht), 0)
  const count = (statuses: string[]) =>
    allMissions.filter((m) => statuses.includes(m.status)).length

  type Recent = {
    id: string
    number: string
    status: 'draft' | 'issued' | 'sent' | 'paid'
    issue_date: string
    total_ttc: number
    pennylane_status: string
    provider: { legal_name: string } | null
  }
  const recent = (invoices.data ?? []) as unknown as Recent[]
  const pennylaneErrors = recent.filter((i) => i.pennylane_status === 'error')

  return (
    <>
      <PageHeader
        title="Tableau de bord"
        description="Vue d’ensemble des prestations et de la facturation."
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="À valider (vous)"
          value={String(count(['manager_approved']))}
          sub={money(sum(['manager_approved']))}
          accent="amber"
        />
        <StatTile
          label="Chez les managers"
          value={String(count(['submitted']))}
          sub={money(sum(['submitted']))}
        />
        <StatTile
          label="Validées, pas encore facturées"
          value={money(sum(['approved']))}
          sub={`${count(['approved'])} prestation(s)`}
          accent="emerald"
        />
        <StatTile
          label="Prestataires"
          value={String(providers.count ?? 0)}
          sub={`${money(sum(['invoiced']))} facturés`}
          accent="brand"
        />
      </div>

      {pennylaneErrors.length > 0 && (
        <div className="mb-8 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-5 py-4">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-600" />
          <div>
            <p className="text-sm font-semibold text-red-900">
              {pennylaneErrors.length} facture{pennylaneErrors.length > 1 ? 's' : ''} en
              erreur de synchronisation Pennylane
            </p>
            <Link
              href="/admin/factures"
              className="mt-1 inline-block text-xs font-medium text-red-700 underline"
            >
              Voir le détail
            </Link>
          </div>
        </div>
      )}

      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Dernières factures</h2>
        <Link href="/admin/factures" className="text-xs text-brand-600 hover:underline">
          Tout voir
        </Link>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Numéro</th>
              <th className="px-4 py-3 font-medium">Prestataire</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 text-right font-medium">TTC</th>
              <th className="px-4 py-3 font-medium">Statut</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {recent.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  Aucune facture pour l’instant.
                </td>
              </tr>
            ) : (
              recent.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50/70">
                  <td className="whitespace-nowrap px-4 py-3">
                    <Link
                      href={`/admin/factures/${inv.id}`}
                      className="font-medium text-brand-600 hover:underline"
                    >
                      {inv.number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {inv.provider?.legal_name ?? '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    {formatDate(inv.issue_date)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-slate-900">
                    {money(inv.total_ttc)}
                  </td>
                  <td className="px-4 py-3">
                    <InvoiceStatusBadge status={inv.status} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </>
  )
}
