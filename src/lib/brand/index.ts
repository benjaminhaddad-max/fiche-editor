import {
  BRANDS,
  deploymentBrandId,
  normalizeBrandId,
  servedBrandIds,
  type BrandConfig,
  type BrandId,
} from '@/lib/brand/config'

export {
  BRANDS,
  deploymentBrandId,
  marqueFacturable,
  normalizeBrandId,
  servedBrandIds,
  type BrandConfig,
  type BrandId,
} from '@/lib/brand/config'

/**
 * La configuration d'une marque donnée.
 *
 * Pour la marque de la requête en cours, passer par `activeBrand()` dans
 * `@/lib/brand/actif` : c'est elle qui tient compte du sélecteur.
 */
export function brandConfig(id: BrandId): BrandConfig {
  return BRANDS[id]
}

/**
 * Ce compte a-t-il le droit d'entrer ici ?
 *
 * Une école ne voit pas l'autre. Un déploiement n'accepte que les marques
 * qu'il sert — Linova Invoice ne sert que Linova, et rien ne change pour
 * ses comptes. Seul « all » traverse : il est réservé aux quelques comptes
 * de direction qui suivent toutes les facturations.
 */
export function portalAccepts(profileBrand: string | null | undefined): boolean {
  if (profileBrand === 'all') return true
  return servedBrandIds().includes(normalizeBrandId(profileBrand))
}

/**
 * Les marques dont une lecture rapporte les lignes.
 *
 * À passer à `.in('brand', …)` : une catégorie commune porte « all » et doit
 * rester visible de partout.
 */
export function brandScopeOf(id: BrandId): ['all', BrandId] {
  return ['all', id]
}

/** Le déploiement sert-il plusieurs marques ? Sinon, pas de sélecteur. */
export function estMultiMarque(): boolean {
  return servedBrandIds().length > 1
}

/** Garde-fou de lecture : la marque demandée est-elle servie ici ? */
export function estMarqueServie(id: BrandId): boolean {
  return servedBrandIds().includes(id)
}

/** Nom du cookie qui porte l'école choisie. */
export const COOKIE_MARQUE = 'marque'

/** Repli sûr quand aucune session n'est disponible (cron, page publique). */
export const MARQUE_PAR_DEFAUT = deploymentBrandId
