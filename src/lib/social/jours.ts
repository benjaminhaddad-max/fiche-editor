/**
 * Les périodes de congé et d'arrêt, et le décompte de leurs jours.
 * Calculs purs (client et serveur) : le salarié ne saisit que les dates.
 */

import { joursFeries } from '@/lib/cycle'

/** `ouvres` : lundi→vendredi. `ouvrables` : lundi→samedi. Fériés exclus dans les deux cas. */
export type RegleJours = 'ouvres' | 'ouvrables'
export const REGLE_DEFAUT: RegleJours = 'ouvres'

export interface PeriodeConge {
  du: string
  au: string
  jours: number
}

const ISO = /^\d{4}-\d{2}-\d{2}$/

/** Nombre de jours décomptés entre deux dates incluses (0 si dates invalides ou inversées). */
export function joursDeConge(du: string | null | undefined, au: string | null | undefined, regle: RegleJours = REGLE_DEFAUT): number {
  if (!du || !au || !ISO.test(du) || !ISO.test(au) || au < du) return 0
  const fin = new Date(`${au}T12:00:00Z`).getTime()
  let total = 0
  const feries = new Map<number, Set<string>>()
  for (let t = new Date(`${du}T12:00:00Z`).getTime(); t <= fin; t += 86_400_000) {
    const d = new Date(t)
    const j = d.getUTCDay()
    if (j === 0) continue
    if (j === 6 && regle === 'ouvres') continue
    const an = d.getUTCFullYear()
    if (!feries.has(an)) feries.set(an, joursFeries(an))
    if (feries.get(an)!.has(d.toISOString().slice(0, 10))) continue
    total++
  }
  return total
}

/** Lit une liste de périodes (JSON ou tableau), recalcule les jours, écarte les lignes vides. */
export function lirePeriodes(brut: unknown, regle: RegleJours = REGLE_DEFAUT): PeriodeConge[] {
  let v = brut
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v)
    } catch {
      return []
    }
  }
  if (!Array.isArray(v)) return []
  const out: PeriodeConge[] = []
  for (const p of v) {
    const du = String(p?.du ?? '')
    const au = String(p?.au ?? '')
    if (!ISO.test(du) || !ISO.test(au) || au < du) continue
    out.push({ du, au, jours: joursDeConge(du, au, regle) })
  }
  return out
}

/** Périodes stockées, sinon l'ancienne saisie à période unique (dates et jours conservés). */
export function periodesDeLigne(brut: unknown, jours: number, du: string | null, au: string | null): PeriodeConge[] {
  if (Array.isArray(brut) && brut.length) {
    return brut
      .map((p) => ({ du: String(p?.du ?? ''), au: String(p?.au ?? ''), jours: Number(p?.jours) || 0 }))
      .filter((p) => ISO.test(p.du) && ISO.test(p.au))
  }
  if (jours > 0) return [{ du: du ?? '', au: au ?? du ?? '', jours }]
  return []
}

export const totalJours = (ps: PeriodeConge[]) => Math.round(ps.reduce((t, p) => t + p.jours, 0) * 100) / 100

/** Les colonnes agrégées (total, première date, dernière date) d'une liste de périodes. */
export function agregat(ps: PeriodeConge[]) {
  const dates = ps.filter((p) => p.du)
  return {
    jours: totalJours(ps),
    debut: dates.length ? dates.map((p) => p.du).sort()[0] : null,
    fin: dates.length ? dates.map((p) => p.au).sort().at(-1)! : null,
  }
}

/** Deux périodes qui se chevauchent. */
export const chevauchement = (ps: PeriodeConge[]) =>
  ps.some((a, i) => ps.some((b, k) => k > i && a.du <= b.au && b.du <= a.au))

/** 1,5 → « 1 h 30 » ; 0,5 → « 30 min » ; 2 → « 2 h ». */
export function formatHeures(h: number): string {
  const total = Math.round(h * 60)
  const hh = Math.floor(total / 60)
  const mm = total % 60
  if (!hh) return `${mm} min`
  return mm ? `${hh} h ${String(mm).padStart(2, '0')}` : `${hh} h`
}
