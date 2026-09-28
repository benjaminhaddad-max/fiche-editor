import { BRANDS, normalizeBrandId, type BrandConfig, type BrandId } from '@/lib/brand/config'

export { BRANDS, type BrandConfig, type BrandId } from '@/lib/brand/config'

/**
 * Quelle école ce déploiement sert-il ?
 *
 * NEXT_PUBLIC_BRAND est inscrite dans le code à la compilation : le serveur
 * et le navigateur d'un même déploiement répondent donc toujours la même
 * chose. Un déploiement sans variable sert Diploma.
 */
export function getBrandId(): BrandId {
  return normalizeBrandId(process.env.NEXT_PUBLIC_BRAND)
}

export function brand(): BrandConfig {
  return BRANDS[getBrandId()]
}

/**
 * Ce compte a-t-il le droit d'entrer ici ?
 *
 * Une école ne voit pas l'autre. Seul « all » traverse : il est réservé aux
 * quelques comptes d'administration qui suivent les deux facturations.
 */
export function portalAccepts(profileBrand: string | null | undefined): boolean {
  return profileBrand === 'all' || normalizeBrandId(profileBrand) === getBrandId()
}

/**
 * Les marques dont ce déploiement lit les lignes.
 *
 * À passer à `.in('brand', …)` : une catégorie commune porte « all » et doit
 * rester visible des deux côtés.
 */
export function brandScope(): BrandId[] | ['all', BrandId] {
  return ['all', getBrandId()]
}
