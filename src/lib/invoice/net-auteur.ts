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
  tax_residence_country?: string | null
  a1_number?: string | null
  a1_start?: string | null
  a1_end?: string | null
}

export interface ModeleEffectif {
  /** Le modèle réellement appliqué. */
  modele: ModeleDA
  /** Le modèle demandé sur la fiche (null = choix automatique, 2 à défaut). */
  demande: ModeleDA
  /** Vrai quand un modèle 4 est demandé sans A1 valide : on applique le 3. */
  repli: boolean
  /** La mention à porter sur la note quand il y a repli. */
  mention: string | null
}

export const MENTION_REPLI_A1 = 'A1 absent ou expiré : modèle 3 appliqué'

/** France, sous ses écritures courantes : « France », « FR », « france ». */
export function estFrance(pays: string | null | undefined): boolean {
  const p = (pays ?? '').trim().toLowerCase()
  return p === 'france' || p === 'fr' || p === 'fra'
}

export function a1Valide(p: ProfilDA, jour: string): boolean {
  if (!p.a1_number || !p.a1_number.trim() || !p.a1_start) return false
  if (p.a1_start > jour) return false
  return !p.a1_end || p.a1_end >= jour
}

/** Un A1 a été saisi, mais il n'est plus (ou pas encore) valide à ce jour. */
export function a1Expire(p: ProfilDA, jour: string): boolean {
  return Boolean(p.a1_number && p.a1_number.trim()) && !a1Valide(p, jour)
}

export interface ModeleSuggere {
  /** null : la résidence fiscale n'est pas renseignée, on ne peut pas trancher. */
  modele: ModeleDA | null
  raison: string
}

/**
 * Le modèle que la fiche appelle, selon les règles de Nolwenn (13/11/2026) :
 *  - résident fiscal français → modèle 2 ;
 *  - A1 valide → modèle 4 ;
 *  - non-résident fiscal, affilié en France (pas de A1 valide) → modèle 3,
 *    avec la mention quand un A1 a été saisi mais a expiré.
 * Le modèle 1 est archivé : il n'est jamais proposé.
 *
 * Version de travail : un résident fiscal français qui produirait un A1
 * reste en modèle 2 (la résidence l'emporte). À faire valider.
 */
export function modeleSuggere(p: ProfilDA, jour?: string): ModeleSuggere {
  const j = jour ?? new Date().toISOString().slice(0, 10)
  const pays = (p.tax_residence_country ?? '').trim()
  if (!pays) return { modele: null, raison: 'Résidence fiscale non renseignée : impossible de choisir le modèle.' }
  if (estFrance(pays)) return { modele: 2, raison: 'Résident fiscal français : modèle 2.' }
  if (a1Valide(p, j)) return { modele: 4, raison: `Non-résident (${pays}) avec un A1 valide : modèle 4.` }
  if (a1Expire(p, j)) return { modele: 3, raison: `Non-résident (${pays}), ${MENTION_REPLI_A1}.` }
  return { modele: 3, raison: `Non-résident fiscal (${pays}), affilié en France, sans A1 : modèle 3.` }
}

/**
 * Le modèle à appliquer à une note. Choix posé sur la fiche (2, 3 ou 4 ; 1
 * archivé se lit comme 2) ; sans choix, le modèle suggéré par la résidence
 * fiscale et le A1, et le 2 si la résidence n'est pas renseignée. Un modèle 4
 * n'est tenu que si le A1 est valide à la date de la note ; sinon on retombe
 * sur le 3, avec une mention.
 * `jour` : 'AAAA-MM-JJ', par défaut aujourd'hui.
 */
export function modeleEffectif(profil: ProfilDA | null | undefined, jour?: string): ModeleEffectif {
  const aujourdhui = jour ?? new Date().toISOString().slice(0, 10)
  const brut = profil?.da_model
  const demande: ModeleDA =
    brut === '4' ? 4 : brut === '3' ? 3 : brut === '2' || brut === '1' ? 2 : (modeleSuggere(profil ?? {}, aujourdhui).modele ?? 2)
  if (demande === 4 && !a1Valide(profil ?? {}, aujourdhui)) {
    return { modele: 3, demande, repli: true, mention: MENTION_REPLI_A1 }
  }
  return { modele: demande, demande, repli: false, mention: null }
}

/**
 * Le modèle d'une note déjà émise. Il est figé sur la note à la création de
 * son PDF (colonne `inv_invoices.da_model`) : changer ensuite la résidence
 * fiscale ou le A1 de l'auteur ne refait pas le calcul d'une note payée.
 *
 * Une note dont le PDF existe sans modèle figé date d'avant le 13/11/2026 :
 * aucune fiche ne portait alors de modèle, elle a été calculée en modèle 2.
 * Une note sans PDF (brouillon) suit encore la fiche.
 */
export function modeleDeLaNote(
  note: { da_model?: string | null; pdf_path?: string | null; issue_date?: string | null },
  profil: ProfilDA | null | undefined
): ModeleEffectif {
  const fige = note.da_model
  if (fige === '2' || fige === '3' || fige === '4') {
    const m = Number(fige) as ModeleDA
    const calcule = modeleEffectif(profil, note.issue_date?.slice(0, 10))
    return { modele: m, demande: m, repli: false, mention: calcule.modele === m ? calcule.mention : null }
  }
  if (note.pdf_path) return { modele: 2, demande: 2, repli: false, mention: null }
  return modeleEffectif(profil, note.issue_date?.slice(0, 10))
}
