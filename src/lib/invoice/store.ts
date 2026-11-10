import { createServiceClient } from '@/lib/supabase/service'
import { BRANDS, marqueFacturable, normalizeBrandId } from '@/lib/brand'
import { renderInvoicePdf, type AuteurPdf } from '@/lib/invoice/pdf'
import { netAuteur } from '@/lib/invoice/net-auteur'
import { estAuteur, type Employment, type Invoice, type InvoiceLine } from '@/lib/types'

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

/**
 * Ce que la facture d'un artiste-auteur doit dire en plus : son numéro de
 * sécurité sociale, que Nolwenn reporte à l'Urssaf pour le précompte, et le
 * net à lui virer. Lus sur la fiche et les prestations au moment du rendu :
 * l'instantané de l'émetteur ne les porte pas.
 */
async function auteurDe(invoice: Invoice, lignesFacture: InvoiceLine[] = []): Promise<AuteurPdf | undefined> {
  const supabase = createServiceClient()
  const { data: fiche } = await supabase
    .from('inv_providers')
    .select('employment_type, social_security_number, birth_date')
    .eq('id', invoice.provider_id)
    .maybeSingle()
  if (!estAuteur(fiche?.employment_type as Employment | undefined)) return undefined

  const { data: lignes } = await supabase
    .from('inv_missions')
    .select('id, total_ht, pay_basis')
    .eq('invoice_id', invoice.id)
  const prestations = (lignes ?? []) as { id: string; total_ht: number; pay_basis: string | null }[]
  // Les lignes ajoutées à la main par l'administration (régularisation,
  // correction d'un oubli) n'ont pas de prestation : elles sont en brut,
  // comme tout droit d'auteur, et entrent dans le précompte.
  for (const l of lignesFacture) {
    if (!l.mission_id) prestations.push({ id: l.id, total_ht: Number(l.total_ht), pay_basis: 'brut' })
  }
  return {
    secu: (fiche?.social_security_number as string | null)?.trim() || null,
    naissance: (fiche?.birth_date as string | null) ?? null,
    bases: Object.fromEntries(prestations.map((l) => [l.id, l.pay_basis])),
    ...netAuteur(prestations),
  }
}

/** Genere le PDF et le range dans le bucket. Renvoie le buffer. */
export async function generateAndStorePdf(invoiceId: string): Promise<Buffer> {
  const loaded = await loadInvoiceForRender(invoiceId)
  if (!loaded) throw new Error('Facture introuvable.')

  // Les mentions légales de l'émetteur sont obligatoires sur une facture.
  // Une marque dont la société n'est pas renseignée s'arrête ici : mieux
  // vaut un traitement qui échoue bruyamment qu'un PDF sans SIRET parti
  // chez le prestataire, puis chez le comptable.
  const m = normalizeBrandId(loaded.invoice.brand)
  if (!marqueFacturable(m)) {
    throw new Error(
      `Les mentions légales de ${BRANDS[m].name} ne sont pas renseignées : ` +
        'complétez la société dans src/lib/brand/config.ts avant d’émettre des factures.'
    )
  }

  const pdf = await renderInvoicePdf(loaded.invoice, loaded.lines, await auteurDe(loaded.invoice, loaded.lines))
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
