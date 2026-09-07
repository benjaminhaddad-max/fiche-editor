import type { InvoiceStatus, MissionStatus, PricingType, Role } from './types'

export const MISSION_STATUS_LABEL: Record<MissionStatus, string> = {
  draft: 'Brouillon',
  submitted: 'En attente manager',
  manager_approved: 'En attente admin',
  approved: 'Validée — facturable',
  rejected: 'Refusée',
  contested: 'Contestée',
  invoiced: 'Facturée',
}

export const MISSION_STATUS_STYLE: Record<MissionStatus, string> = {
  draft: 'bg-cream-deep text-stone ring-line',
  submitted: 'bg-amber-50 text-amber-700 ring-amber-200',
  manager_approved: 'bg-navy/5 text-navy-soft ring-navy/15',
  approved: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  rejected: 'bg-red-50 text-red-700 ring-red-200',
  contested: 'bg-orange-50 text-orange-700 ring-orange-200',
  invoiced: 'bg-gold/15 text-gold-dark ring-gold/30',
}

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: 'Brouillon',
  issued: 'Émise',
  sent: 'Envoyée',
  paid: 'Payée',
}

export const INVOICE_STATUS_STYLE: Record<InvoiceStatus, string> = {
  draft: 'bg-cream-deep text-stone ring-line',
  issued: 'bg-navy/5 text-navy-soft ring-navy/15',
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
  manager: 'Manager',
  admin: 'Administrateur',
}
