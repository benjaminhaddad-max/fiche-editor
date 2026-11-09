import { joursFeries } from '@/lib/cycle'

/**
 * Le calendrier de l'Espace Social (§2 du plan de Shirel).
 *
 * Deux calendriers, tous les deux réglés dans l'admin : rien de ce qui suit
 * n'est une date en dur, seulement la valeur proposée tant que personne ne
 * l'a changée.
 *
 *   Fixes et alternants — paie du mois en cours, versée le 30
 *     le 25 à 8 h       ouverture : demande par email et SMS
 *     le 25 à 18 h      relance des non-répondants
 *     le 26 à 12 h      dernière relance
 *     le 26 à minuit    clôture de la saisie
 *     le 27 au matin    validation par Shirel
 *     le 27 à midi      envoi à Net Paye (sur clic de Shirel)
 *     le 28             limite de réception chez Net Paye
 *     le 30             versement
 *
 *   Vacataires — paie du mois précédent, versée en début de mois
 *     tout le mois M    missions au fil de l'eau
 *     fin de M − 2 j    relance
 *     le 1er de M+1     clôture à midi, validation l'après-midi
 *     le 2              envoi à Net Paye (sur clic de Shirel)
 *     début de M+1      versement (date à confirmer avec Net Paye)
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

export interface CalendrierVacataires {
  /** La relance part tant de jours avant la fin du mois travaillé. */
  relanceJoursAvantFin: number
  relanceHeure: number
  /** Ces moments-là tombent le mois suivant celui travaillé. */
  cloture: Moment
  validation: Moment
  envoi: Moment
  /** Jour du versement, le mois suivant (à confirmer avec Net Paye). */
  versement: number
}

export interface CalendrierSocial {
  fixes: CalendrierFixes
  vacataires: CalendrierVacataires
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
  vacataires: {
    relanceJoursAvantFin: 2,
    relanceHeure: 10,
    cloture: { jour: 1, heure: 12 },
    validation: { jour: 1, heure: 14 },
    envoi: { jour: 2, heure: 10 },
    versement: 5,
  },
  email: true,
  sms: true,
}

/** Fusionne des réglages partiels sur les valeurs proposées. */
export function completerCalendrier(partiel: unknown): CalendrierSocial {
  const p = (partiel ?? {}) as Partial<CalendrierSocial>
  return {
    fixes: { ...CALENDRIER_DEFAUT.fixes, ...(p.fixes ?? {}) },
    vacataires: { ...CALENDRIER_DEFAUT.vacataires, ...(p.vacataires ?? {}) },
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

/** Les étapes du mois M pour les fixes et alternants. */
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

/** Les étapes du mois travaillé M pour les vacataires (clôture en M+1). */
export function etapesVacataires(mois: string, cal: CalendrierSocial): Etape[] {
  const v = cal.vacataires
  const suivant = moisSuivant(mois)
  const [y, mm] = mois.split('-').map(Number)
  const dernier = new Date(Date.UTC(y, mm, 0)).getUTCDate()
  return [
    {
      cle: 'relance',
      libelle: 'Relance : missions et éléments du mois',
      date: jourDuMois(mois, dernier - v.relanceJoursAvantFin),
      heure: v.relanceHeure,
      automatique: true,
    },
    { cle: 'cloture', libelle: 'Clôture des déclarations', ...m(suivant, v.cloture), automatique: true },
    { cle: 'validation', libelle: 'Validation par Shirel', ...m(suivant, v.validation), automatique: false },
    { cle: 'envoi', libelle: 'Envoi à Net Paye', ...m(suivant, v.envoi), automatique: false },
    { cle: 'versement', libelle: 'Versement (à confirmer)', date: jourDuMois(suivant, v.versement), heure: 12, automatique: false },
  ]
}

export function etapes(groupe: 'fixes' | 'vacataires', mois: string, cal: CalendrierSocial): Etape[] {
  return groupe === 'fixes' ? etapesFixes(mois, cal) : etapesVacataires(mois, cal)
}

/** Le moment de clôture de la saisie du mois M, au format `repere`. */
export function clotureDe(groupe: 'fixes' | 'vacataires', mois: string, cal: CalendrierSocial): string {
  const e = etapes(groupe, mois, cal).find((x) => x.cle === 'cloture')!
  return repere(e.date, e.heure)
}

/**
 * Le mois qu'un salarié renseigne en ce moment.
 *
 * Fixes : le mois en cours jusqu'à sa clôture (le 26 au soir), puis le
 * suivant — les congés prévus après la clôture se déclarent à l'avance.
 * Vacataires : le mois écoulé jusqu'à sa clôture (le 1er à midi), puis le
 * mois en cours.
 */
export function moisASaisir(groupe: 'fixes' | 'vacataires', cal: CalendrierSocial, now: Date = new Date()): string {
  const ici = maintenantParis(now)
  const courant = ici.date.slice(0, 7)
  if (groupe === 'fixes') return ici.repere < clotureDe('fixes', courant, cal) ? courant : moisSuivant(courant)
  const precedent = moisPrecedentDe(courant)
  return ici.repere < clotureDe('vacataires', precedent, cal) ? precedent : courant
}

/** La saisie du mois M est-elle encore ouverte au salarié ? */
export function saisieOuverte(groupe: 'fixes' | 'vacataires', mois: string, cal: CalendrierSocial, now: Date = new Date()): boolean {
  return maintenantParis(now).repere < clotureDe(groupe, mois, cal)
}
