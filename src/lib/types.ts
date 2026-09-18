export type Role = 'prestataire' | 'manager' | 'admin'
export type PricingType = 'forfait_mission' | 'forfait_horaire'
export type MissionStatus =
  | 'draft'
  | 'submitted'
  | 'manager_approved'
  | 'approved'
  | 'rejected'
  | 'contested'
  | 'invoiced'
/** Origine d'une prestation : contrat, saisie manager, ajout du prestataire, bon de mission. */
export type MissionOrigin = 'contract' | 'manager' | 'provider' | 'order'
/** Une prestation, ou un bonus (salariés). */
export type MissionKind = 'prestation' | 'bonus'

/** Pôle d'activité : organise les onglets et le type des contrats. */
export type Pole =
  | 'coaching'
  | 'professeur'
  | 'referent'
  | 'enregistrement'
  | 'commercial'
  | 'marketing'
  | 'autres'

export const POLES: Pole[] = [
  'coaching',
  'professeur',
  'referent',
  'enregistrement',
  'commercial',
  'marketing',
  'autres',
]

/** Un indépendant facture ; tous les autres statuts sont payés en salaire. */
export type Employment =
  | 'independant'
  | 'vacataire'
  | 'alternant'
  | 'salarie'
  | 'salarie_enseignant'
  | 'interim'

export const EMPLOYMENTS: Employment[] = [
  'independant',
  'vacataire',
  'alternant',
  'salarie',
  'salarie_enseignant',
  'interim',
]

export const isSalaried = (e: Employment | null | undefined) =>
  Boolean(e) && e !== 'independant'

export interface PersonDocument {
  id: string
  provider_id: string
  kind: 'bulletin' | 'contrat' | 'attestation' | 'autre'
  period: string | null
  label: string
  path: string
  filename: string | null
  source: string
  gross_amount: number | null
  net_amount: number | null
  cost_amount: number | null
  created_at: string
}

export type OrderStatus = 'sent' | 'accepted' | 'declined' | 'done' | 'cancelled'
export type ContractRateType = 'forfait' | 'mission' | 'horaire' | 'mensuel'

export type InvoiceStatus = 'draft' | 'issued' | 'sent' | 'validated' | 'paid'
export type InvoiceKind = 'platform' | 'misc'
export type VatRegime = 'franchise' | 'normal'
export type PennylaneStatus = 'not_synced' | 'synced' | 'error'
/** Origine du PDF : produit par la plateforme, ou déposé par le prestataire. */
export type InvoiceSource = 'generated' | 'uploaded'

export interface AppUser {
  id: string
  auth_id: string
  email: string
  full_name: string
  role: Role
  is_active: boolean
  created_at: string
}

export interface Provider {
  id: string
  /** Absent pour un fournisseur sans compte (facture reçue par email). */
  user_id: string | null
  employment_type: Employment
  contact_email: string | null
  legal_name: string
  legal_form: string | null
  siret: string | null
  vat_number: string | null
  address_line1: string | null
  address_line2: string | null
  postal_code: string | null
  city: string | null
  country: string
  phone: string | null
  iban: string | null
  bic: string | null
  payment_terms_days: number
  vat_regime: VatRegime
  vat_rate: number
  invoice_prefix: string
  next_invoice_seq: number
  invoice_mode: InvoiceSource
  default_manager_id: string | null
  pennylane_supplier_id: number | null
  notes: string | null
  onboarding_complete: boolean
  created_at: string
}

export interface Category {
  id: string
  name: string
  pennylane_label: string | null
  provider_label: string | null
  pennylane_category_id: number | null
  visible_to_provider: boolean
  is_active: boolean
  sort_order: number
  pole: Pole
}

export interface Mission {
  id: string
  provider_id: string
  manager_id: string
  category_id: string
  detail: string
  start_date: string
  end_date: string | null
  pricing_type: PricingType
  quantity: number
  unit_amount_ht: number
  total_ht: number
  status: MissionStatus
  submitted_at: string | null
  manager_approved_at: string | null
  manager_approved_by: string | null
  admin_approved_at: string | null
  admin_approved_by: string | null
  rejected_at: string | null
  rejected_by: string | null
  rejection_reason: string | null
  invoice_id: string | null
  origin: MissionOrigin
  kind: MissionKind
  declaration_id: string | null
  order_id: string | null
  declared_by: string | null
  statement_id: string | null
  created_at: string
}

export interface MissionOrder {
  id: string
  provider_id: string
  manager_id: string
  category_id: string
  title: string
  conditions: string | null
  start_date: string
  end_date: string
  pricing_type: PricingType
  quantity: number
  unit_amount_ht: number
  total_ht: number
  status: OrderStatus
  responded_at: string | null
  provider_note: string | null
  reminded_at: string | null
  done_at: string | null
  mission_id: string | null
  created_at: string
}

/** Résultat du contrôle d'une facture déposée, par lecture du PDF. */
export interface AiCheck {
  checked_at: string
  expected_ht: number | null
  read_ht: number | null
  read_number: string | null
  matches: boolean | null
  message: string | null
}

export interface IssuerSnapshot {
  legal_name: string
  legal_form: string | null
  siret: string | null
  vat_number: string | null
  address_line1: string | null
  address_line2: string | null
  postal_code: string | null
  city: string | null
  country: string
  email: string
  phone: string | null
  iban: string | null
  bic: string | null
  vat_regime: VatRegime
}

export interface Invoice {
  id: string
  provider_id: string
  number: string
  status: InvoiceStatus
  kind: InvoiceKind
  validated_at: string | null
  category_id: string | null
  description: string | null
  ai_check: AiCheck | null
  channel: string | null
  issue_date: string
  due_date: string
  period_start: string | null
  period_end: string | null
  issuer_snapshot: IssuerSnapshot
  subtotal_ht: number
  vat_rate: number
  vat_amount: number
  total_ttc: number
  pdf_path: string | null
  pdf_source: InvoiceSource
  uploaded_filename: string | null
  uploaded_at: string | null
  reminder_count: number
  last_reminder_at: string | null
  issued_at: string | null
  sent_at: string | null
  paid_at: string | null
  pennylane_status: PennylaneStatus
  pennylane_invoice_id: number | null
  pennylane_file_attachment_id: number | null
  pennylane_error: string | null
  pennylane_synced_at: string | null
  created_at: string
}

export interface InvoiceLine {
  id: string
  invoice_id: string
  mission_id: string | null
  description: string
  category_name: string
  pennylane_category_id: number | null
  pricing_type: PricingType
  quantity: number
  unit_amount_ht: number
  total_ht: number
  vat_rate: number
  vat_amount: number
  total_ttc: number
  period_label: string | null
  sort_order: number
}

/** Coordonnees du destinataire des factures : Diploma Sante. */
export const COMPANY = {
  name: process.env.NEXT_PUBLIC_COMPANY_NAME ?? 'Diploma Santé',
  legalForm: process.env.NEXT_PUBLIC_COMPANY_LEGAL_FORM ?? '',
  address: process.env.NEXT_PUBLIC_COMPANY_ADDRESS ?? '',
  postalCode: process.env.NEXT_PUBLIC_COMPANY_POSTAL_CODE ?? '',
  city: process.env.NEXT_PUBLIC_COMPANY_CITY ?? '',
  siret: process.env.NEXT_PUBLIC_COMPANY_SIRET ?? '',
  vatNumber: process.env.NEXT_PUBLIC_COMPANY_VAT ?? '',
} as const
