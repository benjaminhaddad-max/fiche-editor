/**
 * Espace Social : les mots du domaine.
 *
 * Le plan de Shirel (5 novembre 2026) sépare la paie des salariés de la
 * facturation des prestataires. Ces types sont ceux de l'Espace Social
 * seulement : rien ici ne parle de facture ni de bordereau.
 */

import type { Employment } from '@/lib/types'

/** Les trois profils de salariés (§4 du plan). */
export type ProfilSocial = 'fixe' | 'alternant' | 'vacataire'
export const PROFILS: ProfilSocial[] = ['fixe', 'alternant', 'vacataire']
export const PROFIL_LABEL: Record<ProfilSocial, string> = {
  fixe: 'Fixe',
  alternant: 'Alternant',
  vacataire: 'Vacataire',
}

/** Deux calendriers : fixes et alternants ensemble, vacataires à part. */
export type GroupeSocial = 'fixes' | 'vacataires'
export const GROUPE_LABEL: Record<GroupeSocial, string> = {
  fixes: 'Fixes et alternants',
  vacataires: 'Vacataires',
}
export const groupeDuProfil = (p: ProfilSocial): GroupeSocial => (p === 'vacataire' ? 'vacataires' : 'fixes')

/** Le statut de contrat qui va avec le profil, pour le reste de l'outil. */
export const EMPLOI_DU_PROFIL: Record<ProfilSocial, Employment> = {
  fixe: 'salarie',
  alternant: 'alternant',
  vacataire: 'vacataire',
}

export function profilDeLEmploi(e: Employment | null | undefined): ProfilSocial | null {
  if (e === 'vacataire') return 'vacataire'
  if (e === 'alternant') return 'alternant'
  if (e === 'salarie' || e === 'salarie_enseignant') return 'fixe'
  return null
}

/** Statut d'une saisie mensuelle (§6). */
export type StatutSaisie = 'attente' | 'a_valider' | 'valide' | 'a_corriger' | 'transmis'
export const STATUT_LABEL: Record<StatutSaisie, string> = {
  attente: 'Pas répondu',
  a_valider: 'À valider',
  valide: 'Validé',
  a_corriger: 'Renvoyé pour correction',
  transmis: 'Transmis à la paie',
}
export const STATUT_STYLE: Record<StatutSaisie, string> = {
  attente: 'bg-amber-50 text-amber-800 ring-amber-200',
  a_valider: 'bg-sky-50 text-sky-800 ring-sky-200',
  valide: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  a_corriger: 'bg-red-50 text-red-700 ring-red-200',
  transmis: 'bg-slate-100 text-slate-700 ring-slate-200',
}

/** Qui peut valider des heures supplémentaires (§5) : la liste est fermée. */
export const VALIDEURS_HEURES_SUP = ['Ilan Benhamou', 'Benjamin Haddad', 'Shirel Benchetrit'] as const
export type ValideurHeuresSup = (typeof VALIDEURS_HEURES_SUP)[number]

export interface LigneHeuresSup {
  heures: number
  du: string | null
  au: string | null
  motif: string
  validees_par: ValideurHeuresSup
}

export type Mutuelle = 'adherent' | 'dispense' | 'changement' | 'refus' | 'inconnu'
export const MUTUELLE_LABEL: Record<Mutuelle, string> = {
  adherent: 'Adhésion',
  dispense: 'Dispense',
  changement: 'Changement de situation',
  refus: 'Refus',
  inconnu: '—',
}

/** La prise en charge du transport par l'employeur. */
export const TAUX_TRANSPORT = 0.5
export const priseEnChargeTransport = (montant: number | null | undefined) =>
  montant ? Math.round(montant * TAUX_TRANSPORT * 100) / 100 : 0

/**
 * Les variables exportées vers Silae. Chacune a un code rubrique (ou
 * d'absence) dans Silae : la correspondance se règle dans l'admin.
 */
export type VariableSilae =
  | 'conges_payes'
  | 'sans_solde'
  | 'arret_maladie'
  | 'heures_sup'
  | 'transport'
  | 'mutuelle_dispense'
  | 'mutuelle_changement'
  | 'net_vacataire'

export const VARIABLES: { cle: VariableSilae; libelle: string; valeur: string }[] = [
  { cle: 'conges_payes', libelle: 'Congés payés', valeur: 'nombre de jours, avec dates' },
  { cle: 'sans_solde', libelle: 'Congé sans solde', valeur: 'nombre de jours, avec dates' },
  { cle: 'arret_maladie', libelle: 'Arrêt de travail (maladie)', valeur: 'nombre de jours, avec dates' },
  { cle: 'heures_sup', libelle: 'Heures supplémentaires', valeur: 'nombre d’heures, une ligne par déclaration' },
  { cle: 'transport', libelle: 'Transport (prise en charge 50 %)', valeur: 'montant remboursé' },
  { cle: 'mutuelle_dispense', libelle: 'Mutuelle — dispense', valeur: '1' },
  { cle: 'mutuelle_changement', libelle: 'Mutuelle — changement de situation', valeur: '1' },
  { cle: 'net_vacataire', libelle: 'Net vacataires (missions)', valeur: 'montant net, Silae reconstitue le brut' },
]
