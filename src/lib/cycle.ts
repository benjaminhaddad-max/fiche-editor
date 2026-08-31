/**
 * Cycle mensuel de facturation des prestataires.
 *
 * Repris du fonctionnement 2025-2026, à un changement près : ce sont
 * désormais les managers qui saisissent les missions, plus les prestataires.
 *
 *   1er → dernier samedi du mois     les missions sont réalisées et saisies
 *   semaine suivante, lun → mer      vérification par l'administration
 *   mercredi                         envoi du bordereau au prestataire
 *   jusqu'au samedi suivant          contestation, puis envoi de la facture
 *   semaine d'après                  paiements
 */

export interface BillingCycle {
  /** Mois couvert, au format 'YYYY-MM'. */
  month: string
  /** Premier jour de la période de saisie. */
  periodStart: string
  /** Dernier samedi du mois : fin de la période de saisie. */
  periodEnd: string
  /** Lundi suivant : début de la vérification. */
  checkStart: string
  /** Mercredi : fin de la vérification et envoi du bordereau. */
  statementDate: string
  /** Samedi suivant : dernier jour pour contester et facturer. */
  invoiceDeadline: string
  /** Lundi de la semaine de paiement. */
  paymentStart: string
  /** Dimanche de la semaine de paiement. */
  paymentEnd: string
}

const iso = (d: Date) => d.toISOString().slice(0, 10)

/** Toutes les dates sont calculées en UTC : un décalage de fuseau ferait
 *  glisser un samedi sur un vendredi et décalerait tout le cycle. */
function utc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day))
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d)
  out.setUTCDate(out.getUTCDate() + n)
  return out
}

/** Dernier samedi du mois (mois en base 0). */
export function lastSaturday(year: number, month: number): Date {
  const last = utc(year, month + 1, 0)
  // getUTCDay : 0 = dimanche, 6 = samedi
  return addDays(last, -((last.getUTCDay() + 1) % 7))
}

/** Cycle complet pour un mois donné (mois en base 0). */
export function billingCycle(year: number, month: number): BillingCycle {
  const end = lastSaturday(year, month)
  const checkStart = addDays(end, 2)      // lundi
  const statement = addDays(end, 4)       // mercredi
  const deadline = addDays(end, 7)        // samedi suivant
  const payStart = addDays(end, 9)        // lundi de la semaine de paiement

  return {
    month: `${year}-${String(month + 1).padStart(2, '0')}`,
    periodStart: iso(utc(year, month, 1)),
    periodEnd: iso(end),
    checkStart: iso(checkStart),
    statementDate: iso(statement),
    invoiceDeadline: iso(deadline),
    paymentStart: iso(payStart),
    paymentEnd: iso(addDays(payStart, 6)),
  }
}

/** Cycle auquel appartient une date : celui dont la période la contient. */
export function cycleForDate(date: string | Date): BillingCycle {
  const d = typeof date === 'string' ? new Date(`${date.slice(0, 10)}T12:00:00Z`) : date
  const cycle = billingCycle(d.getUTCFullYear(), d.getUTCMonth())
  // Après le dernier samedi, on est déjà sur le cycle du mois suivant.
  if (iso(d) > cycle.periodEnd) {
    const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
    return billingCycle(next.getUTCFullYear(), next.getUTCMonth())
  }
  return cycle
}

/** Les douze cycles d'une année universitaire, de septembre à août. */
export function academicYearCycles(startYear: number): BillingCycle[] {
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(startYear, 8 + i, 1))
    return billingCycle(d.getUTCFullYear(), d.getUTCMonth())
  })
}
