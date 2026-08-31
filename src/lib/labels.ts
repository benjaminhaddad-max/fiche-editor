import type { InvoiceStatus, MissionStatus, PricingType, Role } from './types'

export const MISSION_STATUS_LABEL: Record<MissionStatus, string> = {
  draft: 'Brouillon',
  submitted: 'En attente donneur d’ordre',
  manager_approved: 'En attente admin',
  approved: 'Validée — facturable',
  rejected: 'Refusée',
  invoiced: 'Facturée',
}

export const MISSION_STATUS_STYLE: Record<MissionStatus, string> = {
  draft: 'bg-slate-100 text-slate-600 ring-slate-200',
  submitted: 'bg-amber-50 text-amber-700 ring-amber-200',
  manager_approved: 'bg-sky-50 text-sky-700 ring-sky-200',
  approved: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  rejected: 'bg-red-50 text-red-700 ring-red-200',
  invoiced: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
}

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: 'Brouillon',
  issued: 'Émise',
  sent: 'Envoyée',
  paid: 'Payée',
}

export const INVOICE_STATUS_STYLE: Record<InvoiceStatus, string> = {
  draft: 'bg-slate-100 text-slate-600 ring-slate-200',
  issued: 'bg-sky-50 text-sky-700 ring-sky-200',
  sent: 'bg-amber-50 text-amber-700 ring-amber-200',
  paid: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
}

export const PRICING_LABEL: Record<PricingType, string> = {
  forfait_mission: 'Forfait à la mission',
  forfait_horaire: 'Forfait horaire',
}

/** Unite affichee a cote de la quantite. */
export const PRICING_UNIT: Record<PricingType, string> = {
  forfait_mission: 'mission(s)',
  forfait_horaire: 'heure(s)',
}

export const ROLE_LABEL: Record<Role, string> = {
  prestataire: 'Prestataire',
  manager: 'Donneur d’ordre',
  admin: 'Administrateur',
}
