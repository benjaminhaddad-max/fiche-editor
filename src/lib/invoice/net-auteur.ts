/**
 * Le précompte 2026 que la société retient sur le brut d'un artiste-auteur
 * (Urssaf, taux au 1er janvier 2026) :
 *  - vieillesse plafonnée 6,90 %, dont 0,75 point pris en charge par l'État,
 *    soit 6,15 % sur 100 % du brut ;
 *  - vieillesse déplafonnée 0,40 %, entièrement prise en charge : 0 % ;
 *  - CSG 9,20 % et CRDS 0,50 % sur 98,25 % du brut ;
 *  - formation professionnelle 0,35 % sur 100 % du brut.
 * Soit 16,03 % du brut. Nolwenn l'a relevé le 03/11 : on retenait 20 %.
 *
 * La vieillesse plafonnée ne porte que sous le plafond annuel (48 060 € en
 * 2026) : aucun auteur de la plateforme n'en approche.
 */
export const LIGNES_PRECOMPTE = [
  { libelle: 'Vieillesse plafonnée', taux: 0.0615, assiette: 1 },
  { libelle: 'CSG', taux: 0.092, assiette: 0.9825 },
  { libelle: 'CRDS', taux: 0.005, assiette: 0.9825 },
  { libelle: 'Formation professionnelle', taux: 0.0035, assiette: 1 },
] as const

/** 16,03025 % : le taux effectif sur le brut. */
export const PRECOMPTE_AUTEUR = LIGNES_PRECOMPTE.reduce((t, l) => t + l.taux * l.assiette, 0)

/** « 16,03 % », pour les écrans et les PDF. */
export const PRECOMPTE_AFFICHE = `${(Math.round(PRECOMPTE_AUTEUR * 10000) / 100).toLocaleString('fr-FR')} %`

const arrondi = (n: number) => Math.round(n * 100) / 100

export interface LignePrecompte {
  libelle: string
  /** Le taux appliqué au brut, assiette comprise. */
  taux: number
  montant: number
}

/** Le détail du précompte d'un brut, ligne par ligne, au centime. */
export function detailPrecompte(brut: number): LignePrecompte[] {
  return LIGNES_PRECOMPTE.map((l) => ({
    libelle: l.libelle,
    taux: l.taux * l.assiette,
    montant: arrondi(brut * l.taux * l.assiette),
  }))
}

export interface NetAuteur {
  /** Le montant à virer. Absent seulement quand la facture n'a aucune ligne. */
  net: number | null
  /** Plus utilisé : une ligne sans base compte désormais comme un brut. */
  sansBase: number
  /** Le brut soumis au précompte : les lignes qui ne sont pas déjà nettes. */
  brutSoumis: number
  /** Le précompte retenu, ligne par ligne. Sa somme est exactement brut − net. */
  precompte: LignePrecompte[]
}

/**
 * Le net à verser d'une facture de droits d'auteur.
 *
 * Seule une ligne déclarée en net est versée telle quelle ; une ligne sans
 * base est lue comme un brut. Le précompte se calcule sur le brut total de la
 * facture, comme sur la déclaration Urssaf, et non ligne par ligne : le net
 * du tableau, celui du PDF et le détail des retenues tombent au même centime.
 */
export function netAuteur(lignes: { total_ht: number; pay_basis: string | null }[]): NetAuteur {
  let brutSoumis = 0
  let dejaNet = 0
  for (const l of lignes) {
    const montant = Number(l.total_ht)
    if (l.pay_basis === 'net') dejaNet += montant
    else brutSoumis += montant
  }
  brutSoumis = arrondi(brutSoumis)
  const precompte = detailPrecompte(brutSoumis)
  const retenu = precompte.reduce((t, l) => t + l.montant, 0)
  return {
    net: lignes.length === 0 ? null : arrondi(brutSoumis - retenu + dejaNet),
    sansBase: 0,
    brutSoumis,
    precompte,
  }
}
