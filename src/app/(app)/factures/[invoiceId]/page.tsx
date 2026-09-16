import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Download } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { InvoiceDetail } from '@/components/invoices/InvoiceDetail'
import { requireProvider } from '@/lib/auth'
import { formatDate } from '@/lib/format'
import { createServerSupabase } from '@/lib/supabase/server'
import type { Invoice, InvoiceLine } from '@/lib/types'
import { InvoiceUpload } from '@/components/invoices/InvoiceUpload'
import { sendInvoice, uploadInvoicePdf, useGeneratedPdf } from '../actions'

// La lecture du PDF déposé prend jusqu'à une minute.
export const maxDuration = 120

export default async function InvoicePage({
  params,
}: {
  params: Promise<{ invoiceId: string }>
}) {
  const { invoiceId } = await params
  const { provider } = await requireProvider()
  const supabase = await createServerSupabase()

  const { data } = await supabase
    .from('inv_invoices')
    .select('*')
    .eq('id', invoiceId)
    .eq('provider_id', provider.id)
    .maybeSingle()

  if (!data) notFound()
  const invoice = data as Invoice

  const { data: lineData } = await supabase
    .from('inv_invoice_lines')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('sort_order')

  // Une facture générée part aussitôt : si elle est encore « à transmettre »,
  // c'est qu'on attend le PDF du prestataire.
  const awaitingUpload = invoice.status === 'issued' && invoice.pdf_source !== 'uploaded'

  return (
    <>
      <Link
        href="/factures"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-navy"
      >
        <ArrowLeft size={15} />
        Mes factures
      </Link>

      <div className="mb-6 flex flex-wrap items-center justify-end gap-3">
        <a href={`/api/factures/${invoice.id}/pdf`} target="_blank" rel="noreferrer">
          <Button variant="secondary">
            <Download size={16} />
            Télécharger le PDF
          </Button>
        </a>

      </div>

      {awaitingUpload && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Déposez le PDF de votre facture ci-dessous : son montant est vérifié, puis elle part
          automatiquement à Diploma Santé.
        </div>
      )}

      {invoice.status === 'issued' && (
        <InvoiceUpload
          forceAction={sendInvoice}
          invoice={invoice}
          action={uploadInvoicePdf}
          revertAction={useGeneratedPdf}
        />
      )}

      {invoice.status === 'sent' && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Facture transmise le {formatDate(invoice.sent_at)} — en attente de règlement.
        </div>
      )}
      {invoice.status === 'paid' && (
        <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Facture réglée le {formatDate(invoice.paid_at)}.
        </div>
      )}

      <InvoiceDetail invoice={invoice} lines={(lineData ?? []) as InvoiceLine[]} />
    </>
  )
}
