/**
 * Le précompte 2026 que la société retient sur le brut d'un artiste-auteur
 * (Urssaf, taux au 1er janvier 2026), selon le modèle de certification de
 * l'auteur (voir docs/droits-auteur/modeles-certification-precompte.md) :
 *
 *  - Modèle 2 (résident fiscal en France, le cas courant) :
 *    vieillesse plafonnée 6,90 %, dont 0,75 point pris en charge par l'État,
 *    soit 6,15 % sur 100 % du brut ; vieillesse déplafonnée 0,40 %, entièrement
 *    prise en charge : 0 % ; CSG 9,20 % et CRDS 0,50 % sur 98,25 % du brut ;
 *    formation professionnelle 0,35 %. Soit 16,03 % du brut.
 *  - Modèle 3 (non-résident fiscal, affilié en France) : vieillesse plafonnée
 *    6,15 % et formation professionnelle 0,35 %, sans CSG ni CRDS : 6,5 %.
 *  - Modèle 4 (formulaire A1 valide, affilié dans un autre pays de l'UE) :
 *    aucun précompte, le brut est égal au net. La contribution du diffuseur
 *    (1,1 %) reste due par la société.
 *  - Modèle 1 : archivé, il se lit comme le 2.
 *
 * La vieillesse plafonnée ne porte que sous le plafond annuel (48 060 € en
 * 2026) : aucun auteur de la plateforme n'en approche.
 */
export type ModeleDA = 2 | 3 | 4

interface LigneTaux {
  libelle: string
  taux: number
  assiette: number
}

const LIGNES_M2: readonly LigneTaux[] = [
  { libelle: 'Vieillesse plafonnée', taux: 0.0615, assiette: 1 },
  { libelle: 'CSG', taux: 0.092, assiette: 0.9825 },
  { libelle: 'CRDS', taux: 0.005, assiette: 0.9825 },
  { libelle: 'Formation professionnelle', taux: 0.0035, assiette: 1 },
]

const LIGNES_M3: readonly LigneTaux[] = [
  { libelle: 'Vieillesse plafonnée', taux: 0.0615, assiette: 1 },
  { libelle: 'Formation professionnelle', taux: 0.0035, assiette: 1 },
]

/** Les lignes de précompte d'un modèle. Le modèle 4 n'en a aucune. */
export function lignesPrecompte(modele: ModeleDA): readonly LigneTaux[] {
  if (modele === 4) return []
  return modele === 3 ? LIGNES_M3 : LIGNES_M2
}

/** Compatibilité : les lignes du modèle 2, le cas courant. */
export const LIGNES_PRECOMPTE = LIGNES_M2

/** Le taux effectif sur le brut : 16,03025 % en modèle 2, 6,5 % en modèle 3, 0 en modèle 4. */
export function tauxPrecompte(modele: ModeleDA = 2): number {
  return lignesPrecompte(modele).reduce((t, l) => t + l.taux * l.assiette, 0)
}

export const PRECOMPTE_AUTEUR = tauxPrecompte(2)

/** « 16,03 % » (ou « 6,5 % », « 0 % »), pour les écrans et les PDF. */
export function tauxAffiche(modele: ModeleDA = 2): string {
  return `${(Math.round(tauxPrecompte(modele) * 10000) / 100).toLocaleString('fr-FR')} %`
}

export const PRECOMPTE_AFFICHE = tauxAffiche(2)

/** Contribution du diffuseur : 1,1 % du brut, à la charge de la société. */
export const TAUX_CONTRIBUTION_DIFFUSEUR = 0.011

const arrondi = (n: number) => Math.round(n * 100) / 100

export interface LignePrecompte {
  libelle: string
  /** Le taux appliqué au brut, assiette comprise. */
  taux: number
  montant: number
}

/** Le détail du précompte d'un brut, ligne par ligne, au centime. */
export function detailPrecompte(brut: number, modele: ModeleDA = 2): LignePrecompte[] {
  return lignesPrecompte(modele).map((l) => ({
    libelle: l.libelle,
    taux: l.taux * l.assiette,
    montant: arrondi(brut * l.taux * l.assiette),
  }))
}

/**
 * Le brut qui donne un net fixé. On divise par (1 − taux), puis on cale le
 * précompte total sur brut − net : l'écart d'arrondi (1 à 2 centimes) est
 * porté par la première ligne, pour que brut − retenues = net exactement.
 */
export function brutPourNet(net: number, modele: ModeleDA = 2): { brut: number; precompte: LignePrecompte[] } {
  const taux = tauxPrecompte(modele)
  if (taux === 0) return { brut: arrondi(net), precompte: [] }
  const brut = arrondi(net / (1 - taux))
  const precompte = detailPrecompte(brut, modele)
  const ecart = arrondi(brut - net - precompte.reduce((t, l) => t + l.montant, 0))
  if (ecart !== 0 && precompte.length > 0) {
    precompte[0] = { ...precompte[0], montant: arrondi(precompte[0].montant + ecart) }
  }
  return { brut, precompte }
}

export interface NetAuteur {
  /** Le montant à virer. Absent seulement quand la facture n'a aucune ligne. */
  net: number | null
  /** Plus utilisé : une ligne sans base compte désormais comme un brut. */
  sansBase: number
  /** Le brut soumis au précompte, lignes en brut seulement. */
  brutSoumis: number
  /** Le brut déduit des lignes à net fixé (net remonté au brut). */
  brutDeduit: number
  /** Le brut total de la note : brutSoumis + brutDeduit. */
  brutTotal: number
  /** Le précompte retenu, ligne par ligne. Sa somme est exactement brutTotal − net. */
  precompte: LignePrecompte[]
  /** Le modèle appliqué au calcul. */
  modele: ModeleDA
  /** La contribution du diffuseur (1,1 % du brut), due par la société. */
  contributionDiffuseur: number
}

/**
 * Le net à verser d'une facture de droits d'auteur, selon le modèle.
 *
 * Une ligne en brut subit le précompte du modèle. Une ligne en net est un
 * net fixé : on remonte au brut (brutPourNet) pour que la certification
 * affiche le brut, le précompte et le net. Une ligne sans base est lue comme
 * un brut. Le précompte des lignes en brut se calcule sur leur total, comme
 * sur la déclaration Urssaf. Au total, brut − retenues = net au centime.
 */
export function netAuteur(
  lignes: { total_ht: number; pay_basis: string | null }[],
  modele: ModeleDA = 2,
): NetAuteur {
  let brutSoumis = 0
  let netFixe = 0
  for (const l of lignes) {
    const montant = Number(l.total_ht)
    if (l.pay_basis === 'net') netFixe += montant
    else brutSoumis += montant
  }
  brutSoumis = arrondi(brutSoumis)
  netFixe = arrondi(netFixe)

  const surBrut = detailPrecompte(brutSoumis, modele)
  const surNet = brutPourNet(netFixe, modele)
  const precompte = surBrut.map((l, i) => ({
    ...l,
    montant: arrondi(l.montant + (surNet.precompte[i]?.montant ?? 0)),
  }))
  const brutDeduit = surNet.brut
  const brutTotal = arrondi(brutSoumis + brutDeduit)
  const retenu = precompte.reduce((t, l) => t + l.montant, 0)
  return {
    net: lignes.length === 0 ? null : arrondi(brutTotal - retenu),
    sansBase: 0,
    brutSoumis,
    brutDeduit,
    brutTotal,
    precompte,
    modele,
    contributionDiffuseur: arrondi(brutTotal * TAUX_CONTRIBUTION_DIFFUSEUR),
  }
}

/** Ce que la fiche de l'auteur dit de son modèle et de son justificatif A1. */
export interface ProfilDA {
  da_model?: string | null
  a1_number?: string | null
  a1_start?: string | null
  a1_end?: string | null
}

export interface ModeleEffectif {
  /** Le modèle réellement appliqué. */
  modele: ModeleDA
  /** Le modèle demandé sur la fiche (null = modèle 2 par défaut). */
  demande: ModeleDA
  /** Vrai quand un modèle 4 est demandé sans A1 valide : on applique le 3. */
  repli: boolean
  /** La mention à porter sur la note quand il y a repli. */
  mention: string | null
}

export const MENTION_REPLI_A1 = 'A1 absent ou expiré : modèle 3 appliqué'

function a1Valide(p: ProfilDA, jour: string): boolean {
  if (!p.a1_number || !p.a1_number.trim() || !p.a1_start) return false
  if (p.a1_start > jour) return false
  return !p.a1_end || p.a1_end >= jour
}

/**
 * Le modèle à appliquer à une note. Sans choix sur la fiche : modèle 2 (1
 * archivé se lit comme 2). Un modèle 4 n'est tenu que si le A1 est valide
 * à la date de la note ; sinon on retombe sur le 3, avec une mention.
 * `jour` : 'AAAA-MM-JJ', par défaut aujourd'hui.
 */
export function modeleEffectif(profil: ProfilDA | null | undefined, jour?: string): ModeleEffectif {
  const aujourdhui = jour ?? new Date().toISOString().slice(0, 10)
  const brut = profil?.da_model
  const demande: ModeleDA = brut === '4' ? 4 : brut === '3' ? 3 : 2
  if (demande === 4 && !a1Valide(profil ?? {}, aujourdhui)) {
    return { modele: 3, demande, repli: true, mention: MENTION_REPLI_A1 }
  }
  return { modele: demande, demande, repli: false, mention: null }
}
