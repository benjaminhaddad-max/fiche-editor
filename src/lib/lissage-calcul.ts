// Calculs purs du lissage (testables sans base).

/** Répartit un total en n parts au centime ; la dernière absorbe l'arrondi. */
export function repartir(total: number, n: number): number[] {
  if (n < 1) return []
  const cents = Math.round(total * 100)
  const base = Math.floor(cents / n)
  const parts = Array.from({ length: n }, () => base)
  parts[n - 1] += cents - base * n
  return parts.map((c) => c / 100)
}

/** n mois consécutifs à partir de 'YYYY-MM'. */
export function moisConsecutifs(debut: string, n: number): string[] {
  const [a, m] = debut.split('-').map(Number)
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(a, m - 1 + i, 1))
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  })
}

