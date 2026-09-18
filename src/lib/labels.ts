import type {
  ContractRateType,
  Employment,
  InvoiceStatus,
  MissionStatus,
  OrderStatus,
  Pole,
  PricingType,
  Role,
} from './types'

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
  // « Émise » se lisait « terminé » alors qu'il restait une étape.
  issued: 'À transmettre',
  sent: 'Transmise',
  validated: 'Validée',
  paid: 'Payée',
}

export const INVOICE_STATUS_STYLE: Record<InvoiceStatus, string> = {
  draft: 'bg-cream-deep text-stone ring-line',
  issued: 'bg-navy/5 text-navy-soft ring-navy/15',
  sent: 'bg-amber-50 text-amber-700 ring-amber-200',
  validated: 'bg-sky-50 text-sky-700 ring-sky-200',
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

export const POLE_LABEL: Record<Pole, string> = {
  coaching: 'Coaching',
  professeur: 'Professeur',
  referent: 'Référent pédagogique',
  commercial: 'Commercial',
  marketing: 'Marketing',
  autres: 'Autres',
}

/** Ce que recouvre chaque pôle, pour les contrats comme pour les onglets. */
export const POLE_HINT: Record<Pole, string> = {
  coaching: 'Coaching PASS / LAS / LSPS, PAES, Terminale santé, secrétariat',
  professeur: 'Cours, TD, colles, corrections',
  referent: 'Surveillance de concours blancs, aide pédagogique, impressions',
  commercial: 'Télépro, closers',
  marketing: 'Marketing digital, contenus',
  autres: 'Tout ce qui ne rentre pas ailleurs',
}

export const EMPLOYMENT_LABEL: Record<Employment, string> = {
  independant: 'Indépendant — facture',
  vacataire: 'Vacataire — salaire',
  alternant: 'Alternant — salaire',
  salarie: 'Salarié — salaire',
  salarie_enseignant: 'Salarié enseignant — salaire',
  interim: 'Intérim — via l’agence',
}

/** Le document qui fait foi pour chaque statut. */
export const EMPLOYMENT_HINT: Record<Employment, string> = {
  independant: 'Facture ses prestations depuis la plateforme.',
  vacataire: 'Payé en salaire : prestations et bonus partent à la paie.',
  alternant: 'Contrat d’apprentissage (CERFA) ; primes versées sur la paie.',
  salarie: 'Contrat de travail ; bulletins classés dans son espace.',
  salarie_enseignant: 'Salarié enseignant : heures de cours suivies ici, payées en salaire.',
  interim: 'Mis à disposition par une agence, facturé par elle.',
}

export const DOCUMENT_LABEL: Record<string, string> = {
  bulletin: 'Bulletin de salaire',
  contrat: 'Contrat',
  attestation: 'Attestation',
  autre: 'Document',
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  sent: 'En attente de réponse',
  accepted: 'Acceptée — en cours',
  declined: 'Refusée',
  done: 'Terminée',
  cancelled: 'Annulée',
}

export const ORDER_STATUS_STYLE: Record<OrderStatus, string> = {
  sent: 'bg-amber-50 text-amber-700 ring-amber-200',
  accepted: 'bg-sky-50 text-sky-700 ring-sky-200',
  declined: 'bg-red-50 text-red-700 ring-red-200',
  done: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  cancelled: 'bg-cream-deep text-stone ring-line',
}

export const RATE_TYPE_LABEL: Record<ContractRateType, string> = {
  forfait: 'Forfait global échelonné',
  mission: 'À la mission',
  horaire: 'À l’heure',
  mensuel: 'Mensuel',
}
