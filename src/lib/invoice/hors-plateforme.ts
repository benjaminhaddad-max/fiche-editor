import { isPennylaneConfigured, listSupplierInvoices } from '@/lib/pennylane/client'
import { createServiceClient } from '@/lib/supabase/service'
import { getBrandId } from '@/lib/brand'

/** Une facture arrivée directement en comptabilité, sans passer par ici. */
export interface FactureHorsPlateforme {
  id: number
  date: string
  montant: number
  fournisseur: string
  numero: string | null
  reglee: boolean
  pdf: string | null
}

const PAYEE = new Set(['paid', 'paid_offline', 'fully_paid'])

/**
 * Tout ce que la société doit, y compris ce qui n'est jamais passé par la
 * plateforme.
 *
 * Les prestataires facturent ici, mais le loyer, l'électricité, un
 * fournisseur ponctuel ou une société de portage facturent en direct : ces
 * factures-là n'existaient que dans la comptabilité, et il fallait ouvrir
 * un autre outil pour savoir ce qui restait à régler. On les remonte.
 *
 * Celles que la plateforme a elle-même envoyées sont écartées : elles ont
 * déjà leur ligne, avec leur bordereau et leurs prestations.
 */
export async function facturesHorsPlateforme(): Promise<FactureHorsPlateforme[]> {
  if (!isPennylaneConfigured()) return []

  const { data } = await createServiceClient()
    .from('inv_invoices')
    .select('pennylane_invoice_id')
    .eq('brand', getBrandId())
    .not('pennylane_invoice_id', 'is', null)
  const nôtres = new Set((data ?? []).map((x) => Number((x as { pennylane_invoice_id: number }).pennylane_invoice_id)))

  let toutes: Awaited<ReturnType<typeof listSupplierInvoices>>
  try {
    toutes = await listSupplierInvoices({ pages: 3 })
  } catch {
    return []
  }

  return toutes
    .filter((f) => !nôtres.has(f.id))
    .map((f) => ({
      id: f.id,
      date: f.date,
      montant: Number(f.amount),
      fournisseur: (f.supplier?.name ?? f.label ?? '—').replace(/\s*\(label généré\)\s*$/, '').replace(/^Facture\s+/, ''),
      numero: f.invoice_number,
      reglee: f.paid === true || PAYEE.has(f.payment_status ?? ''),
      pdf: f.public_file_url ?? null,
    }))
    .sort((a, b) => b.date.localeCompare(a.date))
}
