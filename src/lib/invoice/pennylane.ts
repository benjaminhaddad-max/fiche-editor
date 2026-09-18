import {
  PennylaneError,
  amount,
  createSupplier,
  listSuppliers,
  importSupplierInvoice,
  setSupplierInvoiceCategories,
  uploadFileAttachment,
  vatRateCode,
  type PennylaneCategoryWeight,
  type PennylaneInvoiceLine,
} from '@/lib/pennylane/client'
import { getInvoicePdf, loadInvoiceForRender } from '@/lib/invoice/store'
import { createServiceClient } from '@/lib/supabase/service'
import { ibanValide, normaliserIban } from '@/lib/iban'
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

const norm = (s: string | null | undefined) =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/**
 * Trouve le fournisseur Pennylane d'un prestataire, ou le crée.
 *
 * Par SIRET d'abord — c'est la seule clé sans ambiguïté —, puis par nom. Le
 * résultat est mémorisé sur la fiche : la recherche n'a lieu qu'une fois.
 */
async function resolveSupplier(
  providerId: string
): Promise<{ id: number; ibanIgnore: boolean; nom: string }> {
  const supabase = createServiceClient()
  const { data: p } = await supabase
    .from('inv_providers')
    .select(
      `pennylane_supplier_id, legal_name, siret, vat_number, iban, address_line1, postal_code, city,
       contact_email, user:inv_users!inv_providers_user_id_fkey(email)`
    )
    .eq('id', providerId)
    .maybeSingle()
  if (!p) throw new PennylaneError('Prestataire introuvable.')
  if (p.pennylane_supplier_id) {
    return {
      id: Number(p.pennylane_supplier_id),
      ibanIgnore: Boolean(p.iban) && !ibanValide(p.iban),
      nom: p.legal_name,
    }
  }

  const siret = (p.siret ?? '').replace(/\s+/g, '')
  const fournisseurs = await listSuppliers()
  const trouve =
    (/^\d{14}$/.test(siret) && fournisseurs.find((f) => f.establishment_no === siret)) ||
    (/^\d{9}/.test(siret) && fournisseurs.find((f) => f.reg_no === siret.slice(0, 9))) ||
    fournisseurs.find((f) => norm(f.name) === norm(p.legal_name))

  let id: number
  if (trouve) {
    id = trouve.id
  } else {
    const email = p.contact_email ?? (p as unknown as { user: { email: string } | null }).user?.email
    id = await createSupplier({
      name: p.legal_name,
      ...(/^\d{14}$/.test(siret) ? { establishment_no: siret, reg_no: siret.slice(0, 9) } : {}),
      ...(p.vat_number ? { vat_number: p.vat_number } : {}),
      // Un IBAN à la clé fausse ferait refuser toute la fiche fournisseur :
      // on crée le fournisseur sans, et on le signale sur la facture.
      ...(ibanValide(p.iban) ? { iban: normaliserIban(p.iban) } : {}),
      ...(email ? { emails: [email] } : {}),
      ...(p.address_line1 && p.postal_code && p.city
        ? { postal_address: { address: p.address_line1, postal_code: p.postal_code, city: p.city, country_alpha2: 'FR' } }
        : {}),
      external_reference: providerId,
    })
  }

  await supabase.from('inv_providers').update({ pennylane_supplier_id: id }).eq('id', providerId)
  return { id, ibanIgnore: Boolean(p.iban) && !ibanValide(p.iban), nom: p.legal_name }
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

    let fournisseur: { id: number; ibanIgnore: boolean; nom: string }
    try {
      fournisseur = await resolveSupplier(invoice.provider_id)
    } catch (err) {
      throw new PennylaneError(
        `Fournisseur Pennylane introuvable et impossible à créer : ${err instanceof Error ? err.message : String(err)}. ` +
          'Renseignez son ID fournisseur dans sa fiche.'
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
      supplier_id: fournisseur.id,
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
    let categoryWarning: string | null = fournisseur.ibanIgnore
      ? `IBAN de ${fournisseur.nom} non repris dans Pennylane : sa clé de contrôle est fausse. Demandez-lui de le corriger dans ses informations, puis complétez la fiche fournisseur.`
      : null
    try {
      const weights = categoryWeights(lines)
      if (weights.length > 0) {
        await setSupplierInvoiceCategories(pennylaneInvoiceId, weights)
      }
    } catch (err) {
      categoryWarning =
        [categoryWarning, 'Facture créée dans Pennylane, mais la ventilation par catégorie a échoué : ' +
          (err instanceof Error ? err.message : String(err))].filter(Boolean).join(' ')
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
