const EUR = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
})

const DATE = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const DATE_LONG = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

export function money(value: number | string | null | undefined): string {
  // Intl separe les milliers par une espace fine insecable (U+202F), absente
  // des polices PDF standard ou elle se rend en "/". On la remplace par une
  // insecable classique, qui passe partout.
  return EUR.format(Number(value ?? 0)).replace(/\u202f/g, '\u00a0')
}

/**
 * Les dates SQL arrivent en 'YYYY-MM-DD'. On les parse en UTC pour eviter
 * qu'un fuseau negatif ne decale l'affichage d'un jour.
 */
function parseDate(value: string | Date): Date {
  if (value instanceof Date) return value
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value)
  return new Date(dateOnly ? `${value}T12:00:00Z` : value)
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—'
  return DATE.format(parseDate(value))
}

export function formatDateLong(value: string | Date | null | undefined): string {
  if (!value) return '—'
  return DATE_LONG.format(parseDate(value))
}

/** "du 01/03 au 15/03/2026", ou juste la date si pas de fin. */
export function formatPeriod(start: string | null, end: string | null): string {
  if (!start) return '—'
  if (!end || end === start) return formatDate(start)
  return `du ${formatDate(start)} au ${formatDate(end)}`
}

export function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export function addDays(isoDate: string, days: number): string {
  const d = parseDate(isoDate)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Arrondi comptable a 2 decimales, sans erreur de flottant. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}
