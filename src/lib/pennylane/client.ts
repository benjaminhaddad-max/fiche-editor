/**
 * Client Pennylane API v2 — import de factures fournisseur.
 *
 * Flux (cf. https://pennylane.readme.io/docs/supplier-invoicing) :
 *   1. POST /file_attachments            -> upload du PDF, renvoie un id
 *   2. POST /supplier_invoices/import    -> cree la facture d'achat
 *
 * Scopes requis : file_attachments:all, supplier_invoices:all
 */

const BASE_URL = process.env.PENNYLANE_API_URL ?? 'https://app.pennylane.com/api/external/v2'

export class PennylaneError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly body?: unknown
  ) {
    super(message)
    this.name = 'PennylaneError'
  }
}

export function isPennylaneConfigured(): boolean {
  return Boolean(process.env.PENNYLANE_API_TOKEN)
}

function token(): string {
  const t = process.env.PENNYLANE_API_TOKEN
  if (!t) {
    throw new PennylaneError(
      'PENNYLANE_API_TOKEN absent : ajoutez-le dans les variables d’environnement.'
    )
  }
  return t
}

async function parseError(res: Response): Promise<never> {
  let body: unknown
  const text = await res.text()
  try {
    body = JSON.parse(text)
  } catch {
    body = text
  }
  throw new PennylaneError(
    `Pennylane a répondu ${res.status} : ${typeof body === 'string' ? body : JSON.stringify(body)}`,
    res.status,
    body
  )
}

/** Etape 1 : upload du PDF. Renvoie le file_attachment_id. */
export async function uploadFileAttachment(
  pdf: Buffer,
  filename: string
): Promise<number> {
  const form = new FormData()
  form.append('file', new Blob([new Uint8Array(pdf)], { type: 'application/pdf' }), filename)

  const res = await fetch(`${BASE_URL}/file_attachments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}` },
    body: form,
  })

  if (!res.ok) await parseError(res)

  const json = (await res.json()) as { id?: number }
  if (typeof json.id !== 'number') {
    throw new PennylaneError('Réponse inattendue de Pennylane : id de pièce jointe manquant.', 200, json)
  }
  return json.id
}

export interface PennylaneInvoiceLine {
  currency_amount: string
  currency_tax: string
  vat_rate: string
}

/** Ventilation analytique : les poids d'un meme groupe doivent totaliser 1. */
export interface PennylaneCategoryWeight {
  id: number
  weight: string
}

export interface ImportSupplierInvoiceInput {
  file_attachment_id: number
  supplier_id: number
  date: string
  deadline: string
  invoice_number?: string
  currency_amount_before_tax: string
  currency_tax: string
  currency_amount: string
  label?: string
  external_reference?: string
  invoice_lines: PennylaneInvoiceLine[]
}

/** Etape 2 : creation de la facture d'achat. Renvoie l'id Pennylane. */
export async function importSupplierInvoice(
  input: ImportSupplierInvoiceInput
): Promise<number> {
  const res = await fetch(`${BASE_URL}/supplier_invoices/import`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ currency: 'EUR', ...input }),
  })

  if (!res.ok) await parseError(res)

  const json = (await res.json()) as { id?: number; supplier_invoice?: { id?: number } }
  const id = json.id ?? json.supplier_invoice?.id
  if (typeof id !== 'number') {
    throw new PennylaneError('Réponse inattendue de Pennylane : id de facture manquant.', 200, json)
  }
  return id
}

/**
 * Etape 3 : ventilation analytique de la facture.
 *
 * Les categories ne se posent pas sur les lignes mais sur la facture entiere,
 * avec un poids par categorie. Verifie contre l'API : les id_pennylane de
 * Diploma Sante (21634805, 21634860...) sont bien des ID de categories.
 */
export async function setSupplierInvoiceCategories(
  supplierInvoiceId: number,
  categories: PennylaneCategoryWeight[]
): Promise<void> {
  const res = await fetch(
    `${BASE_URL}/supplier_invoices/${supplierInvoiceId}/categories`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(categories),
    }
  )

  if (!res.ok) await parseError(res)
}

/** Code TVA Pennylane correspondant a un taux francais. */
export function vatRateCode(rate: number): string {
  if (rate === 0) return 'exempt'
  if (rate === 20) return 'FR_200'
  if (rate === 10) return 'FR_100'
  if (rate === 5.5) return 'FR_55'
  if (rate === 2.1) return 'FR_21'
  throw new PennylaneError(`Taux de TVA non géré par le mapping Pennylane : ${rate} %`)
}

/** Pennylane attend des montants sous forme de chaines a 2 decimales. */
export function amount(value: number | string): string {
  return Number(value).toFixed(2)
}
