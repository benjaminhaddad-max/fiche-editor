import { createServiceClient } from '@/lib/supabase/service'
import { renderInvoicePdf } from '@/lib/invoice/pdf'
import type { Invoice, InvoiceLine } from '@/lib/types'

export const INVOICE_BUCKET = 'invoices'

export function invoicePdfPath(invoice: Pick<Invoice, 'id' | 'provider_id'>): string {
  // Le prefixe provider_id est ce sur quoi s'appuie la policy storage.
  return `${invoice.provider_id}/${invoice.id}.pdf`
}

/** Chemin du PDF fourni par le prestataire, distinct du PDF genere. */
export function uploadedPdfPath(providerId: string, invoiceId: string): string {
  return `${providerId}/${invoiceId}-depose.pdf`
}

/**
 * Charge une facture et ses lignes SANS passer par la RLS.
 * Reserve aux traitements serveur (PDF, Pennylane) : l'appelant doit avoir
 * verifie les droits en amont.
 */
export async function loadInvoiceForRender(
  invoiceId: string
): Promise<{ invoice: Invoice; lines: InvoiceLine[] } | null> {
  const supabase = createServiceClient()

  const { data: invoice } = await supabase
    .from('inv_invoices')
    .select('*')
    .eq('id', invoiceId)
    .maybeSingle()

  if (!invoice) return null

  const { data: lines } = await supabase
    .from('inv_invoice_lines')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('sort_order')

  return { invoice: invoice as Invoice, lines: (lines ?? []) as InvoiceLine[] }
}

/** Genere le PDF et le range dans le bucket. Renvoie le buffer. */
export async function generateAndStorePdf(invoiceId: string): Promise<Buffer> {
  const loaded = await loadInvoiceForRender(invoiceId)
  if (!loaded) throw new Error('Facture introuvable.')

  const pdf = await renderInvoicePdf(loaded.invoice, loaded.lines)
  const path = invoicePdfPath(loaded.invoice)
  const supabase = createServiceClient()

  const { error } = await supabase.storage
    .from(INVOICE_BUCKET)
    .upload(path, pdf, { contentType: 'application/pdf', upsert: true })

  if (error) throw new Error(`Stockage du PDF impossible : ${error.message}`)

  await supabase.from('inv_invoices').update({ pdf_path: path }).eq('id', invoiceId)

  return pdf
}

/** Recupere le PDF stocke, ou le regenere s'il manque. */
export async function getInvoicePdf(invoiceId: string): Promise<Buffer> {
  const supabase = createServiceClient()
  const { data: invoice } = await supabase
    .from('inv_invoices')
    .select('id, provider_id, pdf_path, pdf_source')
    .eq('id', invoiceId)
    .maybeSingle()

  if (!invoice) throw new Error('Facture introuvable.')

  if (invoice.pdf_path) {
    const { data } = await supabase.storage
      .from(INVOICE_BUCKET)
      .download(invoice.pdf_path)
    if (data) return Buffer.from(await data.arrayBuffer())
  }

  // Une facture deposee par le prestataire ne se regenere pas : si son
  // fichier a disparu, c'est une anomalie, pas quelque chose a masquer.
  if (invoice.pdf_source === 'uploaded') {
    throw new Error(
      'La facture déposée par le prestataire est introuvable dans le stockage.'
    )
  }

  return generateAndStorePdf(invoiceId)
}
