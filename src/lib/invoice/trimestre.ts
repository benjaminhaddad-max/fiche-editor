/**
 * Trimestre de déclaration Urssaf d'un droit d'auteur.
 *
 * Le diffuseur déclare et verse le précompte chaque trimestre, sur les
 * droits qu'il a versés pendant le trimestre (pas sur ceux qu'il a
 * facturés) : avant le 15 du mois qui suit. On classe donc par date de
 * paiement ; une note pas encore payée est rangée, à titre provisoire, au
 * trimestre de sa date.
 *
 * Contribution diffuseur : 1,1 % du brut (1 % + 0,1 % formation), à la
 * charge de Medibox, jamais retenue sur l'auteur.
 */
export const CONTRIBUTION_DIFFUSEUR = 0.011

export interface Trimestre {
  /** « 2026-T4 » */
  cle: string
  annee: number
  numero: 1 | 2 | 3 | 4
  debut: string
  fin: string
  /** Dernier jour pour déclarer et payer : le 15 du mois suivant. */
  echeance: string
  /** « T4 2026 (oct.–déc.) » */
  label: string
}

const MOIS = ['janv.', 'avr.', 'juil.', 'oct.']
const FIN = ['mars', 'juin', 'sept.', 'déc.']

export function trimestre(annee: number, numero: 1 | 2 | 3 | 4): Trimestre {
  const m0 = (numero - 1) * 3
  const fin = new Date(Date.UTC(annee, m0 + 3, 0)).toISOString().slice(0, 10)
  const echeance = new Date(Date.UTC(annee, m0 + 3, 15)).toISOString().slice(0, 10)
  return {
    cle: `${annee}-T${numero}`,
    annee,
    numero,
    debut: `${annee}-${String(m0 + 1).padStart(2, '0')}-01`,
    fin,
    echeance,
    label: `T${numero} ${annee} (${MOIS[numero - 1]}–${FIN[numero - 1]})`,
  }
}

export function trimestreDe(date: string): Trimestre {
  const annee = Number(date.slice(0, 4))
  const mois = Number(date.slice(5, 7))
  return trimestre(annee, (Math.floor((mois - 1) / 3) + 1) as 1 | 2 | 3 | 4)
}

export function contributionDiffuseur(brut: number): number {
  return Math.round(brut * CONTRIBUTION_DIFFUSEUR * 100) / 100
}
