import {
  PennylaneError,
  amount,
  importSupplierInvoice,
  setSupplierInvoiceCategories,
  uploadFileAttachment,
  vatRateCode,
  type PennylaneCategoryWeight,
  type PennylaneInvoiceLine,
} from '@/lib/pennylane/client'
import { getInvoicePdf, loadInvoiceForRender } from '@/lib/invoice/store'
import { createServiceClient } from '@/lib/supabase/service'
import { COMPANY, type InvoiceLine } from '@/lib/types'

export interface SyncResult {
  ok: boolean
  pennylaneInvoiceId?: number
  error?: string
}

/**
 * Repartit la facture entre les categories Pennylane, au prorata du montant
 * de chaque ligne.
 *
 * Pennylane exige que la somme des poids d'un meme groupe fasse exactement 1.
 * Les arrondis a 7 decimales ne tombant pas juste, l'ecart residuel est
 * reporte sur la categorie la plus lourde.
 */
export function categoryWeights(lines: InvoiceLine[]): PennylaneCategoryWeight[] {
  const totals = new Map<number, number>()
  let grandTotal = 0

  for (const line of lines) {
    if (!line.pennylane_category_id) continue
    const value = Number(line.total_ht)
    totals.set(line.pennylane_category_id, (totals.get(line.pennylane_category_id) ?? 0) + value)
    grandTotal += value
  }

  if (grandTotal <= 0 || totals.size === 0) return []

  const entries = [...totals.entries()].sort((a, b) => b[1] - a[1])
  const weights = entries.map(([id, value]) => ({
    id,
    raw: Math.round((value / grandTotal) * 1e7) / 1e7,
  }))

  const drift = Math.round((1 - weights.reduce((s, w) => s + w.raw, 0)) * 1e7) / 1e7
  weights[0].raw = Math.round((weights[0].raw + drift) * 1e7) / 1e7

  return weights.map((w) => ({ id: w.id, weight: String(w.raw) }))
}

/**
 * Pousse une facture dans Pennylane en facture d'achat.
 *
 * C'est ici que se joue le rapprochement qui cassait avant : le nom du
 * fournisseur vient de pennylane_supplier_id (et non du texte du PDF), et
 * les montants sont ceux valides en base, au centime pres.
 */
export async function syncInvoiceToPennylane(invoiceId: string): Promise<SyncResult> {
  const supabase = createServiceClient()

  try {
    const loaded = await loadInvoiceForRender(invoiceId)
    if (!loaded) throw new PennylaneError('Facture introuvable.')
    const { invoice, lines } = loaded

    const { data: provider } = await supabase
      .from('inv_providers')
      .select('pennylane_supplier_id, legal_name')
      .eq('id', invoice.provider_id)
      .maybeSingle()

    if (!provider?.pennylane_supplier_id) {
      throw new PennylaneError(
        `Aucun fournisseur Pennylane associé à « ${provider?.legal_name ?? 'ce prestataire'} ». ` +
          'Renseignez son ID fournisseur dans sa fiche avant de synchroniser.'
      )
    }

    const uncategorised = lines.filter((l) => !l.pennylane_category_id)
    if (uncategorised.length > 0) {
      throw new PennylaneError(
        `Catégorie sans id_pennylane : ${[...new Set(uncategorised.map((l) => l.category_name))].join(', ')}. ` +
          'Complétez-la dans Catégories de missions.'
      )
    }

    // ---- 1. le PDF
    const pdf = await getInvoicePdf(invoiceId)
    const fileAttachmentId = await uploadFileAttachment(
      pdf,
      `${invoice.number.replace(/[^\w.-]/g, '_')}.pdf`
    )

    // ---- 2. la facture d'achat
    const pennylaneLines: PennylaneInvoiceLine[] = lines.map((l) => ({
      currency_amount: amount(l.total_ttc),
      currency_tax: amount(l.vat_amount),
      vat_rate: vatRateCode(Number(l.vat_rate)),
    }))

    const pennylaneInvoiceId = await importSupplierInvoice({
      file_attachment_id: fileAttachmentId,
      supplier_id: Number(provider.pennylane_supplier_id),
      date: invoice.issue_date,
      deadline: invoice.due_date,
      invoice_number: invoice.number,
      currency_amount_before_tax: amount(invoice.subtotal_ht),
      currency_tax: amount(invoice.vat_amount),
      currency_amount: amount(invoice.total_ttc),
      label: `${invoice.issuer_snapshot.legal_name} — ${COMPANY.name}`,
      external_reference: invoice.id,
      invoice_lines: pennylaneLines,
    })

    // ---- 3. la ventilation analytique
    // Non bloquante : la facture existe deja dans Pennylane, on ne la perd pas
    // parce que la categorisation a echoue. L'admin peut resynchroniser.
    let categoryWarning: string | null = null
    try {
      const weights = categoryWeights(lines)
      if (weights.length > 0) {
        await setSupplierInvoiceCategories(pennylaneInvoiceId, weights)
      }
    } catch (err) {
      categoryWarning =
        'Facture créée dans Pennylane, mais la ventilation par catégorie a échoué : ' +
        (err instanceof Error ? err.message : String(err))
      console.error('[pennylane:categories]', err)
    }

    await supabase
      .from('inv_invoices')
      .update({
        pennylane_status: 'synced',
        pennylane_invoice_id: pennylaneInvoiceId,
        pennylane_file_attachment_id: fileAttachmentId,
        pennylane_error: categoryWarning,
        pennylane_synced_at: new Date().toISOString(),
      })
      .eq('id', invoiceId)

    return { ok: true, pennylaneInvoiceId }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await supabase
      .from('inv_invoices')
      .update({ pennylane_status: 'error', pennylane_error: message })
      .eq('id', invoiceId)
    return { ok: false, error: message }
  }
}
