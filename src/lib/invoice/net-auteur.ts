/** Ce que la société retient sur le brut d'un artiste-auteur. */
export const PRECOMPTE_AUTEUR = 0.2

export interface NetAuteur {
  /** Le montant à virer. Absent seulement quand la facture n'a aucune ligne. */
  net: number | null
  /** Plus utilisé : une ligne sans base compte désormais comme un brut. */
  sansBase: number
}

/**
 * Le net à verser d'une facture de droits d'auteur.
 *
 * Règle de Ben (03/11) : le précompte de 20 % s'applique à tous. Seule une
 * ligne déclarée en net est versée telle quelle ; une ligne sans base est lue
 * comme un brut. Avant, ces lignes laissaient le net « à vérifier », et
 * Nolwenn ne pouvait pas payer Paul, Kaoutar ou Mathilde.
 */
export function netAuteur(lignes: { total_ht: number; pay_basis: string | null }[]): NetAuteur {
  let net = 0
  for (const l of lignes) {
    const montant = Number(l.total_ht)
    net += l.pay_basis === 'net' ? montant : montant * (1 - PRECOMPTE_AUTEUR)
  }
  const arrondi = (n: number) => Math.round(n * 100) / 100
  return { net: lignes.length === 0 ? null : arrondi(net), sansBase: 0 }
}
