import { z } from 'zod'
import { VALIDEURS_HEURES_SUP, type LigneHeuresSup } from './types'

/**
 * Le formulaire mensuel, lu côté serveur. Partagé entre la saisie du
 * salarié et la correction par Shirel : les mêmes règles valent pour les
 * deux, à commencer par « Validées par » obligatoire sur chaque ligne
 * d'heures supplémentaires.
 */

const jours = z.coerce.number<number>().min(0).max(31)
const dateFac = z
  .string()
  .trim()
  .regex(/^(\d{4}-\d{2}-\d{2})?$/)
  .optional()
  .transform((v) => v || null)

export const SchemaFormulaire = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/),
  paid_leave_days: jours,
  paid_leave_start: dateFac,
  paid_leave_end: dateFac,
  unpaid_leave_days: jours,
  unpaid_leave_start: dateFac,
  unpaid_leave_end: dateFac,
  sick_leave_days: jours,
  sick_leave_start: dateFac,
  sick_leave_end: dateFac,
  transport: z.enum(['oui', 'non']),
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

/** Contrôle de cohérence des dates : une fin avant le début est une faute de frappe. */
export function datesIncoherentes(v: z.infer<typeof SchemaFormulaire>): string | null {
  const paires: [string | null, string | null, string][] = [
    [v.paid_leave_start, v.paid_leave_end, 'Congés payés'],
    [v.unpaid_leave_start, v.unpaid_leave_end, 'Congé sans solde'],
    [v.sick_leave_start, v.sick_leave_end, 'Arrêt de travail'],
  ]
  for (const [d, f, quoi] of paires) if (d && f && f < d) return `${quoi} : la date de fin précède la date de début.`
  return null
}
