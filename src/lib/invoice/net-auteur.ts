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
 *  - Modèle 3 (non-résident fiscal, affilié en France, sans A1) : vieillesse
 *    plafonnée 6,15 % et formation professionnelle 0,35 %, sans CSG ni CRDS :
 *    6,50 %. Validé par Meghira le 20/11/2026 à titre PROVISOIRE, dans
 *    l'attente d'une confirmation écrite de l'Urssaf Limousin : la note le
 *    dit (MENTION_PROVISOIRE_M3), et on régularise si l'Urssaf répond autrement.
 *  - Modèle 4 (formulaire A1 valide, affilié dans un autre pays de l'UE) :
 *    aucun précompte, le brut est égal au net. La contribution du diffuseur
 *    (1,1 %) reste due par la société.
 *  - Modèle 1 : archivé, il se lit comme le 2.
 *
 * Arrondi (Meghira, 20/11/2026) : chaque ligne est arrondie au centime, le
 * précompte est la somme des lignes arrondies, et c'est ce même montant qui
 * part dans la déclaration Urssaf.
 *
 * La vieillesse plafonnée ne porte que sous le plafond annuel, apprécié par
 * auteur et par année de versement : 47 100 € pour les paiements de 2025,
 * 48 060 € pour ceux de 2026. Au-delà, seule la ligne vieillesse s'arrête.
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
  const t = Math.round(tauxPrecompte(modele) * 10000) / 100
  return `${t === 0 ? '0' : t.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`
}

export const PRECOMPTE_AFFICHE = tauxAffiche(2)

/** Plafond annuel de la vieillesse plafonnée, par année de versement. */
export const PLAFONDS_VIEILLESSE: Record<number, number> = { 2025: 47100, 2026: 48060 }

/** Le plafond d'une année ; une année non connue prend le dernier plafond connu. */
export function plafondAnnuel(annee: number): number {
  if (PLAFONDS_VIEILLESSE[annee]) return PLAFONDS_VIEILLESSE[annee]
  const connues = Object.keys(PLAFONDS_VIEILLESSE).map(Number).sort((a, b) => a - b)
  const avant = connues.filter((a) => a <= annee)
  return PLAFONDS_VIEILLESSE[(avant.length ? avant : connues).at(-1) as number]
}

/** Mention portée sur toute note en modèle 3, tant que l'Urssaf n'a pas confirmé. */
export const MENTION_PROVISOIRE_M3 =
  'Taux de 6,50 % appliqué à titre provisoire, dans l’attente de la confirmation écrite de l’Urssaf Limousin ; ' +
  'il sera régularisé si l’Urssaf retient un autre taux.'

const VIEILLESSE = 'Vieillesse plafonnée'

/** Contribution du diffuseur : 1,1 % du brut, à la charge de la société. */
export const TAUX_CONTRIBUTION_DIFFUSEUR = 0.011

const arrondi = (n: number) => Math.round(n * 100) / 100

export interface LignePrecompte {
  libelle: string
  /** Le taux appliqué au brut, assiette comprise. */
  taux: number
  montant: number
}

/**
 * Le détail du précompte d'un brut, ligne par ligne, au centime.
 * `sousPlafond` : la part du brut encore sous le plafond annuel (tout le brut
 * par défaut) ; la vieillesse plafonnée ne porte que sur elle.
 */
export function detailPrecompte(brut: number, modele: ModeleDA = 2, sousPlafond: number = brut): LignePrecompte[] {
  const plafonnable = Math.max(0, Math.min(brut, sousPlafond))
  return lignesPrecompte(modele).map((l) => ({
    libelle: l.libelle,
    taux: l.taux * l.assiette,
    montant: arrondi((l.libelle === VIEILLESSE ? plafonnable : brut) * l.taux * l.assiette),
  }))
}

/**
 * Le brut qui donne un net fixé. On divise par (1 − taux), puis on cale le
 * précompte total sur brut − net : l'écart d'arrondi (1 à 2 centimes) est
 * porté par la première ligne, pour que brut − retenues = net exactement.
 */
export function brutPourNet(
  net: number,
  modele: ModeleDA = 2,
  sousPlafond: number = Infinity
): { brut: number; precompte: LignePrecompte[] } {
  const taux = tauxPrecompte(modele)
  if (taux === 0) return { brut: arrondi(net), precompte: [] }
  const reste = Math.max(0, sousPlafond)
  let brut = arrondi(net / (1 - taux))
  if (brut <= reste) {
    // Règle de remontée de Nolwenn (23/11/2026) : on garde le brut dont le
    // précompte, arrondi ligne par ligne, redonne exactement le net convenu.
    // Si l'arrondi du quotient n'y arrive pas, on essaie un centime de plus,
    // puis un centime de moins, avant de recourir à l'ajustement ci-dessous.
    for (const delta of [0, 0.01, -0.01]) {
      const candidat = arrondi(brut + delta)
      if (candidat > reste || candidat <= net) continue
      const lignes = detailPrecompte(candidat, modele, reste)
      if (arrondi(candidat - lignes.reduce((t, l) => t + l.montant, 0)) === arrondi(net)) {
        return { brut: candidat, precompte: lignes }
      }
    }
  }
  if (brut > reste) {
    // Au-delà du plafond, la vieillesse ne porte plus : le reste du net se
    // remonte au taux sans elle.
    const horsVieillesse = lignesPrecompte(modele)
      .filter((l) => l.libelle !== VIEILLESSE)
      .reduce((t, l) => t + l.taux * l.assiette, 0)
    brut = arrondi(reste + (net - reste * (1 - taux)) / (1 - horsVieillesse))
  }
  const precompte = detailPrecompte(brut, modele, reste)
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
  /** Vrai quand une part du brut dépasse le plafond annuel : vieillesse limitée. */
  plafondAtteint: boolean
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
  opts: {
    /** Le brut déjà versé à l'auteur dans l'année, avant cette note. */
    cumulAnnee?: number
    /** L'année de versement, pour le plafond (2026 par défaut). */
    annee?: number
  } = {},
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

  // Les lignes en brut prennent le plafond d'abord, les nets convenus ensuite.
  const reste = Math.max(0, plafondAnnuel(opts.annee ?? 2026) - (opts.cumulAnnee ?? 0))
  const surNet = brutPourNet(netFixe, modele, Math.max(0, reste - brutSoumis))
  const brutDeduit = surNet.brut
  // Un seul calcul du précompte, sur le brut total de la note (Nolwenn,
  // 23/11/2026) : la certification montre le taux appliqué au brut affiché,
  // sans écart d'arrondi entre lignes en brut et lignes en net. Sans ligne en
  // brut, on garde le détail de la remontée, qui redonne le net convenu exact.
  const brutTotal = arrondi(brutSoumis + brutDeduit)
  const precompte = brutSoumis === 0 ? surNet.precompte : detailPrecompte(brutTotal, modele, reste)
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
    plafondAtteint: brutTotal > reste && precompte.some((l) => l.libelle === VIEILLESSE),
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
  // Un A1 valide prime sur la résidence fiscale : il atteste que l'auteur
  // cotise dans un autre pays de l'UE, et le règlement (CE) 883/2004
  // (art. 11) ne permet de cotiser que dans un seul pays. Aucun précompte
  // français, même pour un résident fiscal français (tranché le 13/11/2026).
  if (a1Valide(p, j)) return { modele: 4, raison: `A1 valide (${pays}) : modèle 4, aucun précompte.` }
  if (estFrance(pays)) return { modele: 2, raison: 'Résident fiscal français : modèle 2.' }
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
