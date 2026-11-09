/**
 * La saisie mensuelle d'un salarié, ses contrôles et sa traduction en
 * lignes Silae. Rien ici ne touche la base : ce sont des calculs, testés
 * à part (saisie.test.mjs).
 */

import type { CodesSilae } from './parametres'
import {
  priseEnChargeTransport,
  VARIABLES,
  type LigneHeuresSup,
  type Mutuelle,
  type ProfilSocial,
  type StatutSaisie,
  type VariableSilae,
} from './types'

export interface Salarie {
  providerId: string
  userId: string | null
  nom: string
  email: string | null
  telephone: string | null
  profil: ProfilSocial
  matricule: string | null
  entree: string | null
  sortie: string | null
  /** Profil ou email devinés à l'import, pas encore relus. */
  aVerifier?: boolean
}

export interface Saisie {
  id: string | null
  period: string
  status: StatutSaisie
  nothing_to_report: boolean
  overtime_hours: number
  overtime_lines: LigneHeuresSup[]
  paid_leave_days: number
  paid_leave_start: string | null
  paid_leave_end: string | null
  unpaid_leave_days: number
  unpaid_leave_start: string | null
  unpaid_leave_end: string | null
  leave_detail: string | null
  sick_leave_days: number
  sick_leave_start: string | null
  sick_leave_end: string | null
  sick_leave_detail: string | null
  sick_leave_document: string | null
  transport: boolean
  transport_amount: number | null
  transport_document: string | null
  transport_renewed: boolean
  mutuelle: Mutuelle
  mutuelle_detail: string | null
  mutuelle_document: string | null
  comment: string | null
  missions_total: number | null
  submitted_at: string | null
  reminded_at: string | null
  validated_at: string | null
  validated_by: string | null
  returned_at: string | null
  return_comment: string | null
  transmitted_at: string | null
}

const n = (v: unknown) => (v === null || v === undefined || v === '' ? 0 : Number(v))
const nn = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v))
const s = (v: unknown) => (v === null || v === undefined || v === '' ? null : String(v))

/** Une ligne de inv_payroll_inputs, lue telle quelle, en saisie typée. */
export function lireSaisie(row: Record<string, unknown> | null | undefined, period: string): Saisie {
  const r = row ?? {}
  const lignes = Array.isArray(r.overtime_lines) ? (r.overtime_lines as LigneHeuresSup[]) : []
  return {
    id: s(r.id),
    period,
    status: ((r.status as StatutSaisie) ?? (r.submitted_at ? 'a_valider' : 'attente')) as StatutSaisie,
    nothing_to_report: Boolean(r.nothing_to_report),
    overtime_hours: n(r.overtime_hours),
    overtime_lines: lignes.map((l) => ({ ...l, heures: n(l.heures) })),
    paid_leave_days: n(r.paid_leave_days),
    paid_leave_start: s(r.paid_leave_start),
    paid_leave_end: s(r.paid_leave_end),
    unpaid_leave_days: n(r.unpaid_leave_days),
    unpaid_leave_start: s(r.unpaid_leave_start),
    unpaid_leave_end: s(r.unpaid_leave_end),
    leave_detail: s(r.leave_detail),
    sick_leave_days: n(r.sick_leave_days),
    sick_leave_start: s(r.sick_leave_start),
    sick_leave_end: s(r.sick_leave_end),
    sick_leave_detail: s(r.sick_leave_detail),
    sick_leave_document: s(r.sick_leave_document),
    transport: Boolean(r.transport),
    transport_amount: nn(r.transport_amount),
    transport_document: s(r.transport_document),
    transport_renewed: Boolean(r.transport_renewed),
    mutuelle: ((r.mutuelle as Mutuelle) ?? 'inconnu') as Mutuelle,
    mutuelle_detail: s(r.mutuelle_detail),
    mutuelle_document: s(r.mutuelle_document),
    comment: s(r.comment),
    missions_total: nn(r.missions_total),
    submitted_at: s(r.submitted_at),
    reminded_at: s(r.reminded_at),
    validated_at: s(r.validated_at),
    validated_by: s(r.validated_by),
    returned_at: s(r.returned_at),
    return_comment: s(r.return_comment),
    transmitted_at: s(r.transmitted_at),
  }
}

/** A répondu : une saisie envoyée, ou « rien à signaler ». Les relances s'arrêtent. */
export const aRepondu = (x: Saisie) => Boolean(x.submitted_at) && x.status !== 'attente'

export interface Anomalie {
  code: string
  texte: string
}

/** Au-delà, un abonnement de transport mensuel est anormal (un Navigo mensuel fait moins de 100 €). */
export const TRANSPORT_MAX = 100
/** Au-delà, un volume d'heures supplémentaires sur un mois est inhabituel. */
export const HEURES_SUP_MAX = 20

/**
 * Les contrôles signalés avant validation (§6). Une saisie sans anomalie
 * peut partir dans la validation en masse ; les autres se regardent une par une.
 */
export function controler(sal: Salarie, x: Saisie, netMissions: number): Anomalie[] {
  const out: Anomalie[] = []
  if (!sal.matricule) out.push({ code: 'matricule', texte: 'Salarié sans matricule Silae' })
  if (!aRepondu(x)) return out
  if (x.transport && !x.transport_document) out.push({ code: 'justif_transport', texte: 'Justificatif de transport manquant' })
  if (x.transport && (!x.transport_amount || x.transport_amount <= 0))
    out.push({ code: 'transport_montant', texte: 'Transport déclaré sans montant' })
  if (x.transport && (x.transport_amount ?? 0) > TRANSPORT_MAX)
    out.push({ code: 'transport_anormal', texte: `Montant de transport anormal (plus de ${TRANSPORT_MAX} €)` })
  if (x.sick_leave_days > 0 && !x.sick_leave_document) out.push({ code: 'justif_arret', texte: 'Arrêt de travail sans justificatif' })
  if (x.mutuelle === 'dispense' && !x.mutuelle_document)
    out.push({ code: 'justif_mutuelle', texte: 'Dispense de mutuelle sans justificatif' })
  if (x.overtime_hours > HEURES_SUP_MAX)
    out.push({ code: 'heures_sup', texte: `Volume d’heures sup. inhabituel (${x.overtime_hours} h)` })
  if (x.overtime_lines.some((l) => !l.validees_par))
    out.push({ code: 'valideur', texte: 'Heures sup. sans manager valideur' })
  if (sal.profil === 'vacataire' && netMissions <= 0) out.push({ code: 'sans_mission', texte: 'Vacataire sans mission validée' })
  return out
}

export interface LigneSilae {
  matricule: string
  nom: string
  variable: VariableSilae
  code: string
  valeur: number
  debut: string
  fin: string
}

const fr = (d: string | null | undefined) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '')

function bornesMois(period: string): { debut: string; fin: string } {
  const [y, m] = period.split('-').map(Number)
  const fin = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
  return { debut: `${period}-01`, fin }
}

/**
 * Les lignes Silae d'une saisie validée (§7, phase 1 : Matricule / Code /
 * Valeur / Date début / Date fin). Le net des vacataires part en net :
 * c'est Silae qui reconstitue le brut. Aucun brut ne sort d'ici.
 */
export function lignesSilae(sal: Salarie, x: Saisie, netMissions: number, codes: CodesSilae): LigneSilae[] {
  const mois = bornesMois(x.period)
  const out: LigneSilae[] = []
  const pousser = (variable: VariableSilae, valeur: number, debut?: string | null, fin?: string | null) => {
    if (!valeur) return
    out.push({
      matricule: sal.matricule ?? '',
      nom: sal.nom,
      variable,
      code: codes[variable] ?? '',
      valeur: Math.round(valeur * 100) / 100,
      debut: debut || mois.debut,
      fin: fin || debut || mois.fin,
    })
  }
  if (x.nothing_to_report && sal.profil !== 'vacataire') return out
  pousser('conges_payes', x.paid_leave_days, x.paid_leave_start, x.paid_leave_end)
  pousser('sans_solde', x.unpaid_leave_days, x.unpaid_leave_start, x.unpaid_leave_end)
  pousser('arret_maladie', x.sick_leave_days, x.sick_leave_start, x.sick_leave_end)
  if (x.overtime_lines.length) for (const l of x.overtime_lines) pousser('heures_sup', l.heures, l.du, l.au)
  else pousser('heures_sup', x.overtime_hours)
  if (x.transport) pousser('transport', priseEnChargeTransport(x.transport_amount))
  if (x.mutuelle === 'dispense') pousser('mutuelle_dispense', 1)
  if (x.mutuelle === 'changement') pousser('mutuelle_changement', 1)
  if (sal.profil === 'vacataire') pousser('net_vacataire', netMissions)
  return out
}

/** Les variables utilisées dont le code Silae n'est pas encore renseigné. */
export function codesManquants(lignes: LigneSilae[]): { variable: VariableSilae; libelle: string; lignes: number }[] {
  const compte = new Map<VariableSilae, number>()
  for (const l of lignes) if (!l.code) compte.set(l.variable, (compte.get(l.variable) ?? 0) + 1)
  return [...compte.entries()].map(([variable, lignes]) => ({
    variable,
    libelle: VARIABLES.find((v) => v.cle === variable)?.libelle ?? variable,
    lignes,
  }))
}

/** Le fichier d'import Silae : CSV point-virgule, virgule décimale, dates JJ/MM/AAAA. */
export function csvSilae(lignes: LigneSilae[]): string {
  const champ = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  const corps = lignes.map((l) =>
    [l.matricule, l.code, String(l.valeur).replace('.', ','), fr(l.debut), fr(l.fin)].map(champ).join(';')
  )
  return ['Matricule;Code;Valeur;Date début;Date fin', ...corps].join('\r\n') + '\r\n'
}
