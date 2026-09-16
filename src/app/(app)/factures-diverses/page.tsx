import { MiscInvoiceUpload } from '@/components/admin/MiscInvoiceUpload'
import { InvoiceStatusBadge } from '@/components/ui/Badge'
import { Card, EmptyState, PageHeader } from '@/components/ui/Page'
import { requireRole } from '@/lib/auth'
import { formatDate, money } from '@/lib/format'
import { createServiceClient } from '@/lib/supabase/service'
import type { InvoiceStatus } from '@/lib/types'

export const maxDuration = 300

/** Le manager dépose les factures qu'il reçoit : elles partent chez Benjamin. */
export default async function FacturesDiversesPage() {
  const user = await requireRole('manager', 'admin')
  const db = createServiceClient()
  const [{ data: cats }, { data }] = await Promise.all([
    db.from('inv_categories').select('id, name').eq('is_active', true).order('sort_order'),
    db
      .from('inv_invoices')
      .select('id, number, status, issue_date, total_ttc, channel, provider:inv_providers(legal_name)')
      .eq('kind', 'misc')
      .eq('submitted_by', user.id)
      .order('created_at', { ascending: false })
      .limit(50),
  ])
  const factures = (data ?? []) as unknown as {
    id: string
    number: string
    status: InvoiceStatus
    issue_date: string
    total_ttc: number
    channel: string | null
    provider: { legal_name: string } | null
  }[]

  return (
    <>
      <PageHeader
        title="Déposer une facture"
        description="Une facture de fournisseur, de prestataire sans compte, ou toute autre dépense : déposez le PDF, la plateforme fait le reste."
      />
      <Card className="mb-6 p-5">
        <MiscInvoiceUpload categories={cats ?? []} inboundAddress={process.env.DEPOT_FACTURES_EMAIL ?? null} />
      </Card>

      <h2 className="mb-3 text-sm font-semibold text-navy">Mes dépôts</h2>
      {factures.length === 0 ? (
        <EmptyState title="Aucune facture déposée" />
      ) : (
        <Card className="divide-y divide-line/60 overflow-hidden">
          {factures.map((f) => (
            <div key={f.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
              <span>
                <span className="font-medium text-navy">{f.provider?.legal_name ?? '—'}</span>
                <span className="ml-2 text-muted">
                  {f.number} · {formatDate(f.issue_date)}
                  {f.channel === 'email' ? ' · par email' : ''}
                </span>
              </span>
              <span className="flex items-center gap-3">
                <InvoiceStatusBadge status={f.status} />
                <span className="w-24 text-right font-semibold text-navy">{money(f.total_ttc)}</span>
              </span>
            </div>
          ))}
        </Card>
      )}
    </>
  )
}
