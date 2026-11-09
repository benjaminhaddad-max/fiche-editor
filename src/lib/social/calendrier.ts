import { joursFeries } from '@/lib/cycle'

/**
 * Le calendrier de l'Espace Social (§2 du plan de Shirel).
 *
 * Un seul calendrier, pour tout le monde — fixes, alternants et vacataires :
 * la paie de novembre se prépare fin novembre et se verse le 30 novembre.
 * Rien de ce qui suit n'est une date en dur, seulement la valeur proposée
 * tant que personne ne l'a changée dans Espace Social → Paramètres.
 *
 *     le 25 à 8 h       demande des éléments par email et SMS
 *     le 25 à 18 h      relance des non-répondants
 *     le 26 à 12 h      dernière relance
 *     le 26 à minuit    clôture de la saisie
 *     le 27 au matin    validation par Shirel
 *     le 27 à midi      envoi à Net Paye (sur clic de Shirel)
 *     le 28             limite de réception chez Net Paye
 *     le 30             versement
 *
 * Les missions d'un vacataire comptent sur la paie qui les suit : celles
 * validées après l'envoi du mois partent avec la paie du mois suivant.
 *
 * Une date qui tombe un week-end ou un jour férié est avancée au jour ouvré
 * précédent, y compris le versement du 30 (en février : le dernier jour).
 */

/** Un moment du mois : un jour (31 = le dernier) et une heure (24 = minuit, fin du jour). */
export interface Moment {
  jour: number
  heure: number
}

export interface CalendrierFixes {
  ouverture: Moment
  relance: Moment
  derniereRelance: Moment
  cloture: Moment
  validation: Moment
  envoi: Moment
  /** Jour limite de réception chez Net Paye. */
  limiteNetPaye: number
  /** Jour du versement des salaires. */
  versement: number
}

export interface CalendrierSocial {
  /** Le calendrier du mois, le même pour tous les salariés (le nom est resté). */
  fixes: CalendrierFixes
  /** Canaux des demandes et relances. */
  email: boolean
  sms: boolean
}

export const CALENDRIER_DEFAUT: CalendrierSocial = {
  fixes: {
    ouverture: { jour: 25, heure: 8 },
    relance: { jour: 25, heure: 18 },
    derniereRelance: { jour: 26, heure: 12 },
    cloture: { jour: 26, heure: 24 },
    validation: { jour: 27, heure: 9 },
    envoi: { jour: 27, heure: 12 },
    limiteNetPaye: 28,
    versement: 30,
  },
  email: true,
  sms: true,
}

/** Fusionne des réglages partiels sur les valeurs proposées. */
export function completerCalendrier(partiel: unknown): CalendrierSocial {
  const p = (partiel ?? {}) as Partial<CalendrierSocial>
  return {
    fixes: { ...CALENDRIER_DEFAUT.fixes, ...(p.fixes ?? {}) },
    email: p.email ?? CALENDRIER_DEFAUT.email,
    sms: p.sms ?? CALENDRIER_DEFAUT.sms,
  }
}

const iso = (d: Date) => d.toISOString().slice(0, 10)
const utc = (y: number, m: number, j: number) => new Date(Date.UTC(y, m, j, 12))

function ouvre(d: Date): boolean {
  const j = d.getUTCDay()
  return j !== 0 && j !== 6 && !joursFeries(d.getUTCFullYear()).has(iso(d))
}

/** Le jour même s'il est ouvré, sinon le jour ouvré qui précède. */
export function jourOuvrePrecedent(date: string): string {
  let d = new Date(`${date}T12:00:00Z`)
  while (!ouvre(d)) d = new Date(d.getTime() - 86_400_000)
  return iso(d)
}

/** Le jour J du mois (borné au dernier jour), avancé au jour ouvré précédent. */
export function jourDuMois(mois: string, jour: number): string {
  const [y, m] = mois.split('-').map(Number)
  const dernier = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return jourOuvrePrecedent(iso(utc(y, m - 1, Math.min(Math.max(1, jour), dernier))))
}

export function moisSuivant(mois: string): string {
  const [y, m] = mois.split('-').map(Number)
  return iso(utc(y, m, 1)).slice(0, 7)
}

export function moisPrecedentDe(mois: string): string {
  const [y, m] = mois.split('-').map(Number)
  return iso(utc(y, m - 2, 1)).slice(0, 7)
}

export interface Etape {
  cle: string
  libelle: string
  /** Jour, déjà avancé au jour ouvré précédent. */
  date: string
  heure: number
  /** Une étape qu'Invoice joue d'elle-même (demande, relance). */
  automatique: boolean
}

/** Repère comparable « heure de Paris » : AAAA-MM-JJ HH. */
export const repere = (date: string, heure: number) => `${date} ${String(heure).padStart(2, '0')}`

/** L'heure qu'il est à Paris, au même format que `repere`. */
export function maintenantParis(now: Date = new Date()): { date: string; heure: number; repere: string } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Paris',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((x) => [x.type, x.value])
  )
  const date = `${p.year}-${p.month}-${p.day}`
  const heure = Number(p.hour)
  return { date, heure, repere: repere(date, heure) }
}

const m = (mois: string, mo: Moment) => ({ date: jourDuMois(mois, mo.jour), heure: mo.heure })

/** Les étapes de la paie du mois M, pour tout le monde. */
export function etapesFixes(mois: string, cal: CalendrierSocial): Etape[] {
  const f = cal.fixes
  return [
    { cle: 'ouverture', libelle: 'Demande des éléments (email et SMS)', ...m(mois, f.ouverture), automatique: true },
    { cle: 'relance', libelle: 'Relance des non-répondants', ...m(mois, f.relance), automatique: true },
    { cle: 'derniere_relance', libelle: 'Dernière relance', ...m(mois, f.derniereRelance), automatique: true },
    { cle: 'cloture', libelle: 'Clôture de la saisie', ...m(mois, f.cloture), automatique: true },
    { cle: 'validation', libelle: 'Validation par Shirel', ...m(mois, f.validation), automatique: false },
    { cle: 'envoi', libelle: 'Envoi à Net Paye', ...m(mois, f.envoi), automatique: false },
    { cle: 'limite', libelle: 'Limite de réception chez Net Paye', date: jourDuMois(mois, f.limiteNetPaye), heure: 24, automatique: false },
    { cle: 'versement', libelle: 'Versement des salaires', date: jourDuMois(mois, f.versement), heure: 12, automatique: false },
  ]
}

/** Les étapes du mois : le même calendrier pour les fixes et les vacataires. */
export function etapes(_groupe: 'fixes' | 'vacataires', mois: string, cal: CalendrierSocial): Etape[] {
  return etapesFixes(mois, cal)
}

/** Le moment de clôture de la saisie du mois M, au format `repere`. */
export function clotureDe(groupe: 'fixes' | 'vacataires', mois: string, cal: CalendrierSocial): string {
  const e = etapes(groupe, mois, cal).find((x) => x.cle === 'cloture')!
  return repere(e.date, e.heure)
}

/**
 * Le mois qu'un salarié renseigne en ce moment : le mois en cours jusqu'à
 * sa clôture (le 26 au soir), puis le suivant — les congés prévus après la
 * clôture se déclarent à l'avance. Pareil pour tout le monde.
 */
export function moisASaisir(groupe: 'fixes' | 'vacataires', cal: CalendrierSocial, now: Date = new Date()): string {
  const ici = maintenantParis(now)
  const courant = ici.date.slice(0, 7)
  return ici.repere < clotureDe(groupe, courant, cal) ? courant : moisSuivant(courant)
}

/** La saisie du mois M est-elle encore ouverte au salarié ? */
export function saisieOuverte(groupe: 'fixes' | 'vacataires', mois: string, cal: CalendrierSocial, now: Date = new Date()): boolean {
  return maintenantParis(now).repere < clotureDe(groupe, mois, cal)
}
