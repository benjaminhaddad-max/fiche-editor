import { z } from 'zod'
import { agregat, chevauchement, lirePeriodes, REGLE_DEFAUT, type PeriodeConge, type RegleJours } from './jours'
import { VALIDEURS_HEURES_SUP, type LigneHeuresSup } from './types'

/**
 * Le formulaire mensuel, lu côté serveur. Partagé entre la saisie du
 * salarié et la correction par Shirel : les mêmes règles valent pour les
 * deux, à commencer par « Validées par » obligatoire sur chaque ligne
 * d'heures supplémentaires.
 */

export const SchemaFormulaire = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/),
  transport: z.enum(['oui', 'non', 'annuel']),
  transport_amount: z.union([z.coerce.number<number>().min(0).max(1000), z.literal('')]).optional(),
  transport_renewed: z.string().optional(),
  mutuelle: z.enum(['adherent', 'dispense', 'changement']),
  mutuelle_detail: z.string().trim().max(500).optional(),
  comment: z.string().trim().max(1000).optional(),
  heures_sup: z.string().optional(),
})

const LigneHS = z.object({
  heures: z.coerce.number<number>().positive('Indiquez un nombre d’heures.').max(200),
  du: z.string().trim().nullable().optional(),
  au: z.string().trim().nullable().optional(),
  motif: z.string().trim().max(300).default(''),
  validees_par: z.string().trim(),
})

/** Les lignes d'heures sup, ou le message qui empêche l'enregistrement. */
export function lireHeuresSup(brut: string | undefined): { lignes: LigneHeuresSup[] } | { erreur: string } {
  if (!brut) return { lignes: [] }
  let tableau: unknown
  try {
    tableau = JSON.parse(brut)
  } catch {
    return { erreur: 'Heures supplémentaires illisibles.' }
  }
  if (!Array.isArray(tableau)) return { lignes: [] }
  const lignes: LigneHeuresSup[] = []
  for (const [i, x] of tableau.entries()) {
    const l = LigneHS.safeParse(x)
    if (!l.success) return { erreur: `Heures sup., ligne ${i + 1} : ${l.error.issues[0].message}` }
    if (!(VALIDEURS_HEURES_SUP as readonly string[]).includes(l.data.validees_par)) {
      return {
        erreur: `Heures sup., ligne ${i + 1} : choisissez qui les a validées (${VALIDEURS_HEURES_SUP.join(', ')}). Sans manager, la ligne ne peut pas être enregistrée.`,
      }
    }
    lignes.push({
      heures: l.data.heures,
      du: l.data.du || null,
      au: l.data.au || l.data.du || null,
      motif: l.data.motif,
      validees_par: l.data.validees_par as LigneHeuresSup['validees_par'],
    })
  }
  return { lignes }
}

const TYPES_CONGE = [
  ['paid_leave', 'Congés payés'],
  ['unpaid_leave', 'Congé sans solde'],
  ['sick_leave', 'Arrêt de travail'],
] as const

export interface Conges {
  paid_leave_periods: PeriodeConge[]
  paid_leave_days: number
  paid_leave_start: string | null
  paid_leave_end: string | null
  unpaid_leave_periods: PeriodeConge[]
  unpaid_leave_days: number
  unpaid_leave_start: string | null
  unpaid_leave_end: string | null
  sick_leave_periods: PeriodeConge[]
  sick_leave_days: number
  sick_leave_start: string | null
  sick_leave_end: string | null
}

/**
 * Les périodes de congé et d'arrêt du formulaire. Seules les dates comptent :
 * les jours sont recalculés ici, jamais crus sur parole.
 */
export function lireConges(fd: FormData, regle: RegleJours = REGLE_DEFAUT): { conges: Conges } | { erreur: string } {
  const out: Record<string, unknown> = {}
  for (const [nom, quoi] of TYPES_CONGE) {
    const brut = fd.get(`${nom}_periodes`)
    let tableau: unknown = []
    try {
      tableau = brut ? JSON.parse(String(brut)) : []
    } catch {
      return { erreur: `${quoi} : périodes illisibles.` }
    }
    if (Array.isArray(tableau) && tableau.some((p) => String(p?.au ?? '') < String(p?.du ?? ''))) {
      return { erreur: `${quoi} : la date de fin précède la date de début.` }
    }
    const ps = lirePeriodes(tableau, regle)
    if (chevauchement(ps)) return { erreur: `${quoi} : deux périodes se chevauchent.` }
    const ag = agregat(ps)
    out[`${nom}_periods`] = ps
    out[`${nom}_days`] = ag.jours
    out[`${nom}_start`] = ag.debut
    out[`${nom}_end`] = ag.fin
  }
  return { conges: out as unknown as Conges }
}
