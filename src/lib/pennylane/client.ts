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

/**
 * Un appel qui attend son tour.
 *
 * Pennylane limite le débit et répond 429 « retry in 1 second ». Envoyer
 * trente-sept factures d'affilée en faisait passer huit : les autres se
 * faisaient refouler et ressortaient en erreur, alors qu'il suffisait
 * d'attendre une seconde. On patiente, on réessaie, et on laisse souffler
 * entre deux requêtes.
 */
async function appel(url: string, init?: RequestInit): Promise<Response> {
  for (let essai = 0; ; essai++) {
    // globalThis.fetch, et non `appel` : s'appeler soi-même ici, c'est une
    // récursion infinie — elle a fait tomber vingt-neuf envois sur trente.
    const res = await globalThis.fetch(url, init)
    if (res.status !== 429 || essai >= 5) return res
    const entete = Number(res.headers.get('retry-after') ?? '')
    const attente = Number.isFinite(entete) && entete > 0 ? entete * 1000 : 1000 * 2 ** essai
    await new Promise((r) => setTimeout(r, Math.min(attente, 8000)))
  }
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

  const res = await appel(`${BASE_URL}/file_attachments`, {
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
  const res = await appel(`${BASE_URL}/supplier_invoices/import`, {
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
  const res = await appel(
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

export interface PennylaneSupplier {
  id: number
  name: string
  establishment_no?: string | null
  reg_no?: string | null
  vat_number?: string | null
}

/**
 * La liste des fournisseurs, gardée une minute.
 *
 * Elle est relue pour chaque facture envoyée, et elle se pagine sur
 * plusieurs centaines de lignes : à trente-sept factures d'affilée, c'est
 * elle qui déclenchait la limite de débit, pas l'envoi lui-même. Elle ne
 * bouge pas pendant un envoi groupé — sauf quand on vient d'y créer
 * quelqu'un, et dans ce cas on l'oublie exprès.
 */
let cacheFournisseurs: { a: number; liste: PennylaneSupplier[] } | null = null
export const oublierFournisseurs = () => {
  cacheFournisseurs = null
}

/** Tous les fournisseurs, en suivant la pagination par curseur. */
export async function listSuppliers(): Promise<PennylaneSupplier[]> {
  if (cacheFournisseurs && Date.now() - cacheFournisseurs.a < 60_000) return cacheFournisseurs.liste
  const out: PennylaneSupplier[] = []
  let cursor: string | null = null
  for (let page = 0; page < 50; page++) {
    const url = `${BASE_URL}/suppliers?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
    const res = await appel(url, { headers: { Authorization: `Bearer ${token()}` } })
    if (!res.ok) await parseError(res)
    const body = (await res.json()) as { items?: PennylaneSupplier[]; has_more?: boolean; next_cursor?: string }
    out.push(...(body.items ?? []))
    if (!body.has_more || !body.next_cursor) break
    cursor = body.next_cursor
  }
  cacheFournisseurs = { a: Date.now(), liste: out }
  return out
}

export interface CreateSupplierInput {
  name: string
  establishment_no?: string
  reg_no?: string
  vat_number?: string
  emails?: string[]
  iban?: string
  postal_address?: { address: string; postal_code: string; city: string; country_alpha2: string }
  external_reference?: string
}

/** Crée un fournisseur (scope suppliers:all). Renvoie son id. */
export async function createSupplier(input: CreateSupplierInput): Promise<number> {
  cacheFournisseurs = null
  const res = await appel(`${BASE_URL}/suppliers`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) await parseError(res)
  const json = (await res.json()) as { id?: number }
  if (typeof json.id !== 'number') {
    throw new PennylaneError('Réponse inattendue de Pennylane : id de fournisseur manquant.', 200, json)
  }
  return json.id
}

/**
 * Met à jour un fournisseur : son IBAN, et son nom s'il est fautif.
 *
 * C'est l'IBAN qui compte — c'est lui qui dirige le virement. Celui de la
 * fiche fait foi : la personne l'a saisi elle-même, et elle seule le
 * connaît. Pennylane gardait le sien, parfois vieux de deux ans.
 */
/** Un fournisseur précis, pour comparer ce que la comptabilité a retenu. */
export async function getSupplier(id: number): Promise<PennylaneSupplier & { iban?: string | null }> {
  const res = await appel(`${BASE_URL}/suppliers/${id}`, {
    headers: { Authorization: `Bearer ${token()}` },
  })
  if (!res.ok) await parseError(res)
  return (await res.json()) as PennylaneSupplier & { iban?: string | null }
}

export async function updateSupplier(
  id: number,
  champs: { iban?: string; name?: string }
): Promise<void> {
  const res = await appel(`${BASE_URL}/suppliers/${id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(champs),
  })
  if (!res.ok) await parseError(res)
  cacheFournisseurs = null
}

export interface PennylaneInvoiceResume {
  id: number
  date: string
  amount: string
  label: string | null
  invoice_number: string | null
  payment_status: string | null
  paid: boolean | null
  supplier: { name?: string | null } | null
  public_file_url?: string | null
}

/**
 * Les factures d'achat récentes, toutes origines confondues.
 *
 * On ne lit pas que les nôtres : une facture saisie directement dans
 * Pennylane, ou déposée par un tiers, compte autant pour repérer un double
 * règlement. La pagination est bornée — on cherche un doublon récent, pas
 * l'historique.
 */
export async function listSupplierInvoices(opts: { pages?: number } = {}): Promise<PennylaneInvoiceResume[]> {
  const out: PennylaneInvoiceResume[] = []
  let curseur: string | null = null
  for (let i = 0; i < (opts.pages ?? 3); i++) {
    const url = `${BASE_URL}/supplier_invoices?limit=100${curseur ? `&cursor=${encodeURIComponent(curseur)}` : ''}`
    const res = await appel(url, { headers: { Authorization: `Bearer ${token()}` } })
    if (!res.ok) await parseError(res)
    const json = (await res.json()) as {
      items?: PennylaneInvoiceResume[]
      has_more?: boolean
      next_cursor?: string | null
    }
    out.push(...(json.items ?? []))
    if (!json.has_more || !json.next_cursor) break
    curseur = json.next_cursor
  }
  return out
}

/**
 * Dire à la comptabilité qu'une facture est réglée — ou ne l'est plus.
 *
 * C'est tout ce que l'API permet : elle n'émet pas de virement. Il n'existe
 * aucun endpoint de paiement sortant, et les « mandats » du compte pro sont
 * des prélèvements SEPA, donc de l'argent qui entre. Le virement part de la
 * banque ; ceci met les écritures d'accord avec lui.
 *
 * Pennylane ne rapproche pas automatiquement le mouvement bancaire : la
 * facture est marquée payée, le lettrage reste à faire de leur côté.
 */
export async function setSupplierInvoicePaymentStatus(
  id: number,
  statut: 'paid' | 'to_be_paid'
): Promise<void> {
  const res = await appel(`${BASE_URL}/supplier_invoices/${id}/payment_status`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ payment_status: statut }),
  })
  if (!res.ok) await parseError(res)
}

export interface PennylaneInvoiceState {
  id: number
  paid?: boolean
  payment_status?: string
  remaining_amount_with_tax?: string | null
}

/** État d'une facture d'achat : payée ou non, et ce qu'il reste à régler. */
export async function getSupplierInvoice(id: number): Promise<PennylaneInvoiceState> {
  const res = await appel(`${BASE_URL}/supplier_invoices/${id}`, {
    headers: { Authorization: `Bearer ${token()}` },
  })
  if (!res.ok) await parseError(res)
  return (await res.json()) as PennylaneInvoiceState
}
