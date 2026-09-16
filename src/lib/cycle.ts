/**
 * Cycle mensuel de facturation — règle de septembre 2026.
 *
 * Pour un mois M dont le dernier jour est L :
 *
 *   du 1er à L−3         les prestataires déclarent leurs prestations
 *   de L−2 à L           les managers vérifient, corrigent, complètent
 *   L+1 (le 1er)         le bordereau global part à chaque prestataire,
 *                        toutes les missions de tous les pôles réunies
 *   jusqu'à L+2 (le 2)   le prestataire génère ou dépose sa facture
 *   L+3 (le 3)           paiement, une fois toutes les factures reçues
 *
 * Jours calendaires, week-ends compris. Toutes les dates sont calculées en
 * UTC : un fuseau négatif ferait glisser une date d'un jour.
 */

/** Jours laissés aux managers avant la fin du mois. */
export const REVIEW_DAYS = 3
/** Jours laissés au prestataire pour envoyer sa facture, bordereau reçu. */
export const INVOICE_DAYS = 2

export interface BillingCycle {
  /** Mois couvert, au format 'YYYY-MM'. */
  month: string
  /** « septembre 2026 ». */
  label: string
  periodStart: string
  /** Dernier jour du mois. */
  periodEnd: string
  /** Dernier jour pour déclarer (L−3). */
  declarationDeadline: string
  /** Vérification des managers (L−2 → L). */
  reviewStart: string
  reviewEnd: string
  /** Envoi du bordereau global (L+1). */
  statementDate: string
  /** Dernier jour pour transmettre la facture (L+2). */
  invoiceDeadline: string
  /** Paiement (L+3). */
  paymentDate: string
  /** Colonnes historiques des bordereaux : un seul jour de paiement désormais. */
  paymentStart: string
  paymentEnd: string
}

export type CyclePhase = 'declaration' | 'verification' | 'facturation' | 'paiement' | 'termine'

const MOIS = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' })

const iso = (d: Date) => d.toISOString().slice(0, 10)

function utc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day))
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d)
  out.setUTCDate(out.getUTCDate() + n)
  return out
}

function parse(date: string | Date): Date {
  return typeof date === 'string' ? new Date(`${date.slice(0, 10)}T12:00:00Z`) : date
}

/** Aujourd'hui, à Paris : le changement de jour doit suivre l'heure française. */
export function todayParis(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date())
}

/** Cycle complet pour un mois donné (mois en base 0). */
export function billingCycle(year: number, month: number): BillingCycle {
  const last = utc(year, month + 1, 0)
  const statement = addDays(last, 1)
  const payment = addDays(last, 1 + INVOICE_DAYS)

  return {
    month: `${year}-${String(month + 1).padStart(2, '0')}`,
    label: MOIS.format(utc(year, month, 15)),
    periodStart: iso(utc(year, month, 1)),
    periodEnd: iso(last),
    declarationDeadline: iso(addDays(last, -REVIEW_DAYS)),
    reviewStart: iso(addDays(last, -(REVIEW_DAYS - 1))),
    reviewEnd: iso(last),
    statementDate: iso(statement),
    invoiceDeadline: iso(addDays(statement, INVOICE_DAYS - 1)),
    paymentDate: iso(payment),
    paymentStart: iso(payment),
    paymentEnd: iso(payment),
  }
}

/** Cycle du mois qui contient la date. */
export function cycleForDate(date: string | Date): BillingCycle {
  const d = parse(date)
  return billingCycle(d.getUTCFullYear(), d.getUTCMonth())
}

/** Cycle d'un mois 'YYYY-MM'. */
export function cycleForMonth(month: string): BillingCycle {
  const [y, m] = month.split('-').map(Number)
  return billingCycle(y, m - 1)
}

export function previousCycle(cycle: BillingCycle): BillingCycle {
  const d = parse(cycle.periodStart)
  return billingCycle(d.getUTCFullYear(), d.getUTCMonth() - 1)
}

export function nextCycle(cycle: BillingCycle): BillingCycle {
  const d = parse(cycle.periodStart)
  return billingCycle(d.getUTCFullYear(), d.getUTCMonth() + 1)
}

/**
 * Le cycle dont on parle aujourd'hui. Du 1er au 3, c'est encore celui du
 * mois précédent : bordereaux, factures et paiement le concernent.
 */
export function activeCycle(today: string = todayParis()): BillingCycle {
  const courant = cycleForDate(today)
  const precedent = previousCycle(courant)
  return today <= precedent.paymentDate ? precedent : courant
}

export function phaseOf(cycle: BillingCycle, today: string = todayParis()): CyclePhase {
  if (today <= cycle.declarationDeadline) return 'declaration'
  if (today <= cycle.reviewEnd) return 'verification'
  if (today <= cycle.invoiceDeadline) return 'facturation'
  if (today <= cycle.paymentDate) return 'paiement'
  return 'termine'
}

/**
 * Un prestataire peut-il encore déclarer une prestation datée de ce jour ?
 * Jusqu'à L−3 du mois de la prestation. Au-delà, c'est son manager qui
 * l'ajoute pendant la vérification.
 */
export function providerCanDeclare(missionDate: string, today: string = todayParis()): boolean {
  return today <= cycleForDate(missionDate).declarationDeadline
}

/** Un manager peut-il encore saisir ou corriger cette prestation ? Jusqu'à L. */
export function managerCanEdit(missionDate: string, today: string = todayParis()): boolean {
  return today <= cycleForDate(missionDate).reviewEnd
}

/** Les douze cycles d'une année universitaire, de septembre à août. */
export function academicYearCycles(startYear: number): BillingCycle[] {
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(startYear, 8 + i, 1))
    return billingCycle(d.getUTCFullYear(), d.getUTCMonth())
  })
}
