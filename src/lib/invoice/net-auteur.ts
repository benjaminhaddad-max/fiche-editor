/** Ce que la société retient sur le brut d'un artiste-auteur. */
export const PRECOMPTE_AUTEUR = 0.2

export interface NetAuteur {
  /** Le montant à virer. Absent tant qu'une ligne n'a pas de base. */
  net: number | null
  /** Le total des lignes dont on ignore si elles sont en brut ou en net. */
  sansBase: number
}

/**
 * Le net à verser d'une facture de droits d'auteur.
 *
 * Une ligne sans base ne se devine pas : les deux lectures donnent deux
 * virements différents, et Faustine ou Kaoutar en ont de telles. Le net reste
 * alors vide, et l'écran dit qu'il est à vérifier plutôt que d'afficher un
 * montant qui rassure à tort.
 */
export function netAuteur(lignes: { total_ht: number; pay_basis: string | null }[]): NetAuteur {
  let net = 0
  let sansBase = 0
  for (const l of lignes) {
    const montant = Number(l.total_ht)
    if (l.pay_basis === 'net') net += montant
    else if (l.pay_basis === 'brut') net += montant * (1 - PRECOMPTE_AUTEUR)
    else sansBase += montant
  }
  const arrondi = (n: number) => Math.round(n * 100) / 100
  return { net: sansBase > 0 || lignes.length === 0 ? null : arrondi(net), sansBase: arrondi(sansBase) }
}
