import { cache } from 'react'
import { cookies } from 'next/headers'
import { getSessionUser } from '@/lib/auth'
import {
  BRANDS,
  brandScopeOf,
  deploymentBrandId,
  estMarqueServie,
  normalizeBrandId,
  type BrandConfig,
  type BrandId,
} from '@/lib/brand'

/** Nom du cookie qui porte le choix du sélecteur. */
export const COOKIE_MARQUE = 'marque'

/**
 * La marque de la requête en cours.
 *
 * Trois cas, dans cet ordre :
 *
 *  1. Pas de session (cron, page publique) → la marque du déploiement.
 *  2. Un compte rattaché à une marque → la sienne, et rien d'autre. C'est
 *     le cas de tout le monde aujourd'hui : rien ne change pour eux, et un
 *     cookie traînant ne peut pas leur ouvrir la facturation d'à côté.
 *  3. Un compte « all » → ce que dit le sélecteur, à condition que le
 *     déploiement serve cette marque. Sinon, celle du déploiement.
 *
 * Mise en cache par requête : les quelque cent lectures d'une page ne font
 * qu'une résolution.
 */
export const activeBrandId = cache(async (): Promise<BrandId> => {
  const user = await getSessionUser()
  if (!user) return deploymentBrandId()
  if (user.brand !== 'all') return normalizeBrandId(user.brand)

  const choisie = normalizeBrandId((await cookies()).get(COOKIE_MARQUE)?.value)
  return estMarqueServie(choisie) ? choisie : deploymentBrandId()
})

/** La configuration de la marque active. */
export async function activeBrand(): Promise<BrandConfig> {
  return BRANDS[await activeBrandId()]
}

/** À passer à `.in('brand', …)` pour une lecture de la marque active. */
export async function activeBrandScope(): Promise<['all', BrandId]> {
  return brandScopeOf(await activeBrandId())
}
