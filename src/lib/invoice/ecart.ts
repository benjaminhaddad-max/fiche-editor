/**
 * Écart entre le montant facturé et le montant prévu.
 *
 * Ce n'est pas une étape du cycle de vie (brouillon, envoyée, validée,
 * payée) mais une condition qui peut survenir à plusieurs étapes : on la
 * CALCULE à partir du contrôle du PDF (`ai_check`) au lieu d'ajouter une
 * valeur à l'enum du statut. Seule sa levée est enregistrée : qui l'a
 * validée, quand, et pourquoi (`ecart_valide_at`, `ecart_valide_by`,
 * `ecart_motif`). Tant qu'elle ne l'est pas, la facture est « À vérifier » :
 * ni marquée payée, ni envoyée à la liste de paiement ou à Pennylane.
 */
export interface ControleMontant {
  expected_ht: number | null
  read_ht: number | null
  matches: boolean | null
}

export interface EcartFacture {
  ai_check?: ControleMontant | null
  ecart_valide_at?: string | null
}

/** Le montant lu dans le PDF diffère du montant prévu (au centime près). */
export function aUnEcart(f: EcartFacture): boolean {
  const c = f.ai_check
  if (!c) return false
  if (c.matches === false) return true
  if (c.expected_ht !== null && c.read_ht !== null) {
    return Math.abs(Number(c.read_ht) - Number(c.expected_ht)) >= 0.01
  }
  return false
}

/** Écart constaté et pas encore validé par un administrateur : « À vérifier ». */
export function aVerifier(f: EcartFacture): boolean {
  return aUnEcart(f) && !f.ecart_valide_at
}

export const MOTIF_ECART_BLOQUE =
  'Écart de montant à vérifier : un administrateur doit le valider avant tout paiement.'
