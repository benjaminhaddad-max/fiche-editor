import Link from 'next/link'
import { Download } from 'lucide-react'
import { Badge, InvoiceStatusBadge } from '@/components/ui/Badge'
import { Card, EmptyState, PageHeader } from '@/components/ui/Page'
import { requireRole } from '@/lib/auth'
import { formatDate, money } from '@/lib/format'
import { createServerSupabase } from '@/lib/supabase/server'
import type { InvoiceStatus, PennylaneStatus } from '@/lib/types'

interface Row {
  id: string
  number: string
  status: InvoiceStatus
  issue_date: string
  due_date: string
  subtotal_ht: number
  total_ttc: number
  pennylane_status: PennylaneStatus
  provider: { legal_name: string } | null
}

const PENNYLANE_BADGE: Record<PennylaneStatus, { label: string; style: string }> = {
  not_synced: { label: 'Non synchronisée', style: 'bg-cream-deep text-navy/70 ring-line' },
  synced: { label: 'Pennylane OK', style: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  error: { label: 'Erreur Pennylane', style: 'bg-red-50 text-red-700 ring-red-200' },
}

export default async function AdminInvoicesPage() {
  await requireRole('admin')
  const supabase = await createServerSupabase()

  const { data } = await supabase
    .from('inv_invoices')
    .select(
      'id, number, status, issue_date, due_date, subtotal_ht, total_ttc, pennylane_status, provider:inv_providers(legal_name)'
    )
    .order('issue_date', { ascending: false })

  const invoices = (data ?? []) as unknown as Row[]
  const outstanding = invoices
    .filter((i) => i.status !== 'paid')
    .reduce((s, i) => s + Number(i.total_ttc), 0)

  return (
    <>
      <PageHeader
        title="Factures"
        description={`${invoices.length} facture(s) · ${money(outstanding)} restant à régler`}
      />

      {invoices.length === 0 ? (
        <EmptyState
          title="Aucune facture"
          description="Les factures apparaîtront ici dès qu’un prestataire en générera une."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-cream-muted text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Numéro</th>
                  <th className="px-4 py-3 font-medium">Prestataire</th>
                  <th className="px-4 py-3 font-medium">Émise</th>
                  <th className="px-4 py-3 font-medium">Échéance</th>
                  <th className="px-4 py-3 text-right font-medium">HT</th>
                  <th className="px-4 py-3 text-right font-medium">TTC</th>
                  <th className="px-4 py-3 font-medium">Statut</th>
                  <th className="px-4 py-3 font-medium">Pennylane</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-cream-muted">
                    <td className="whitespace-nowrap px-4 py-3">
                      <Link
                        href={`/admin/factures/${inv.id}`}
                        className="font-medium text-gold-dark hover:underline"
                      >
                        {inv.number}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-navy/80">
                      {inv.provider?.legal_name ?? '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-navy/70">
                      {formatDate(inv.issue_date)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-navy/70">
                      {formatDate(inv.due_date)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-navy/70">
                      {money(inv.subtotal_ht)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-navy">
                      {money(inv.total_ttc)}
                    </td>
                    <td className="px-4 py-3">
                      <InvoiceStatusBadge status={inv.status} />
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={PENNYLANE_BADGE[inv.pennylane_status].style}>
                        {PENNYLANE_BADGE[inv.pennylane_status].label}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <a
                        href={`/api/factures/${inv.id}/pdf`}
                        target="_blank"
                        rel="noreferrer"
                        title="Télécharger le PDF"
                        className="inline-flex rounded p-1.5 text-muted transition-colors hover:bg-cream-deep hover:text-navy"
                      >
                        <Download size={15} />
                      </a>
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
