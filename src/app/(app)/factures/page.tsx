import Link from 'next/link'
import { Download, Plus } from 'lucide-react'
import { InvoiceStatusBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, EmptyState, PageHeader } from '@/components/ui/Page'
import { requireProvider } from '@/lib/auth'
import { formatDate, money } from '@/lib/format'
import { createServerSupabase } from '@/lib/supabase/server'
import type { Invoice } from '@/lib/types'

export default async function InvoicesPage() {
  const { provider } = await requireProvider()
  const supabase = await createServerSupabase()

  const [{ data: invoiceData }, { count: billableCount }] = await Promise.all([
    supabase
      .from('inv_invoices')
      .select('*')
      .eq('provider_id', provider.id)
      .order('issue_date', { ascending: false }),
    supabase
      .from('inv_missions')
      .select('id', { count: 'exact', head: true })
      .eq('provider_id', provider.id)
      .eq('status', 'approved')
      .is('invoice_id', null),
  ])

  const invoices = (invoiceData ?? []) as Invoice[]

  return (
    <>
      <PageHeader
        title="Mes factures"
        description="Les factures générées à partir de vos prestations validées."
        actions={
          (billableCount ?? 0) > 0 ? (
            <Link href="/factures/nouvelle">
              <Button>
                <Plus size={16} />
                Générer une facture
              </Button>
            </Link>
          ) : undefined
        }
      />

      {invoices.length === 0 ? (
        <EmptyState
          title="Aucune facture"
          description={
            (billableCount ?? 0) > 0
              ? 'Vous avez des prestations validées : vous pouvez générer votre première facture.'
              : 'Vos factures apparaîtront ici une fois vos prestations validées.'
          }
          action={
            (billableCount ?? 0) > 0 ? (
              <Link href="/factures/nouvelle">
                <Button>Générer une facture</Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Numéro</th>
                  <th className="px-4 py-3 font-medium">Émise le</th>
                  <th className="px-4 py-3 font-medium">Échéance</th>
                  <th className="px-4 py-3 text-right font-medium">Total TTC</th>
                  <th className="px-4 py-3 font-medium">Statut</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/70">
                    <td className="whitespace-nowrap px-4 py-3">
                      <Link
                        href={`/factures/${inv.id}`}
                        className="font-medium text-brand-600 hover:underline"
                      >
                        {inv.number}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {formatDate(inv.issue_date)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {formatDate(inv.due_date)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-slate-900">
                      {money(inv.total_ttc)}
                    </td>
                    <td className="px-4 py-3">
                      <InvoiceStatusBadge status={inv.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <a
                        href={`/api/factures/${inv.id}/pdf`}
                        target="_blank"
                        rel="noreferrer"
                        title="Télécharger le PDF"
                        className="inline-flex rounded p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
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
