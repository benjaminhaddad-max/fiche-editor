import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Download, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Page'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { InvoiceDetail } from '@/components/invoices/InvoiceDetail'
import { requireRole } from '@/lib/auth'
import { formatDate } from '@/lib/format'
import { isPennylaneConfigured } from '@/lib/pennylane/client'
import { createServerSupabase } from '@/lib/supabase/server'
import type { Invoice, InvoiceLine } from '@/lib/types'
import { markInvoicePaid, pushToPennylane } from '@/app/(app)/factures/actions'

export default async function AdminInvoicePage({
  params,
}: {
  params: Promise<{ invoiceId: string }>
}) {
  const { invoiceId } = await params
  await requireRole('admin')
  const supabase = await createServerSupabase()

  const { data } = await supabase
    .from('inv_invoices')
    .select('*')
    .eq('id', invoiceId)
    .maybeSingle()

  if (!data) notFound()
  const invoice = data as Invoice

  const [{ data: lineData }, { data: provider }] = await Promise.all([
    supabase
      .from('inv_invoice_lines')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('sort_order'),
    supabase
      .from('inv_providers')
      .select('id, legal_name, pennylane_supplier_id')
      .eq('id', invoice.provider_id)
      .maybeSingle(),
  ])

  const pennylaneReady = isPennylaneConfigured() && Boolean(provider?.pennylane_supplier_id)

  return (
    <>
      <Link
        href="/admin/factures"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-navy"
      >
        <ArrowLeft size={15} />
        Factures
      </Link>

      <div className="mb-6 flex flex-wrap items-center justify-end gap-3">
        <a href={`/api/factures/${invoice.id}/pdf`} target="_blank" rel="noreferrer">
          <Button variant="secondary">
            <Download size={16} />
            PDF
          </Button>
        </a>

        <form action={pushToPennylane}>
          <input type="hidden" name="invoice_id" value={invoice.id} />
          <SubmitButton
            variant="secondary"
            disabled={!pennylaneReady}
            pendingLabel="Synchronisation…"
          >
            <RefreshCw size={16} />
            {invoice.pennylane_status === 'synced'
              ? 'Resynchroniser Pennylane'
              : 'Envoyer dans Pennylane'}
          </SubmitButton>
        </form>

        {invoice.status !== 'paid' && (
          <form action={markInvoicePaid}>
            <input type="hidden" name="invoice_id" value={invoice.id} />
            <SubmitButton variant="success" pendingLabel="Enregistrement…">
              Marquer comme payée
            </SubmitButton>
          </form>
        )}
      </div>

      {!isPennylaneConfigured() && (
        <div className="mb-6 rounded-lg border border-line bg-white px-4 py-3 text-sm text-navy/70">
          Synchronisation Pennylane désactivée : la variable{' '}
          <code className="rounded bg-cream-deep px-1 py-0.5 text-xs">
            PENNYLANE_API_TOKEN
          </code>{' '}
          n’est pas configurée.
        </div>
      )}

      {isPennylaneConfigured() && !provider?.pennylane_supplier_id && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Aucun ID fournisseur Pennylane pour {provider?.legal_name}.{' '}
          <Link
            href={`/admin/prestataires/${invoice.provider_id}`}
            className="font-semibold underline"
          >
            Le renseigner
          </Link>{' '}
          avant de synchroniser.
        </div>
      )}

      {invoice.pennylane_status === 'error' && invoice.pennylane_error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span className="font-semibold">Erreur Pennylane :</span> {invoice.pennylane_error}
        </div>
      )}

      {invoice.pennylane_status === 'synced' && (
        <Card className="mb-6 px-4 py-3 text-sm text-navy/80">
          Synchronisée dans Pennylane le {formatDate(invoice.pennylane_synced_at)} — facture
          d’achat n° {invoice.pennylane_invoice_id}.
        </Card>
      )}

      <InvoiceDetail invoice={invoice} lines={(lineData ?? []) as InvoiceLine[]} />
    </>
  )
}
