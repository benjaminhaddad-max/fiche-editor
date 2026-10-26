import { AsyncLocalStorage } from 'node:async_hooks'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { getSessionUser, mesMarques } from '@/lib/auth'
import {
  BRANDS,
  COOKIE_MARQUE,
  brandScopeOf,
  deploymentBrandId,
  estMarqueServie,
  normalizeBrandId,
  servedBrandIds,
  type BrandConfig,
  type BrandId,
} from '@/lib/brand'

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
/**
 * Marque imposée le temps d'un traitement.
 *
 * Le cron n'a pas de session : sans cela il ne travaillerait que pour la
 * marque du déploiement, et le cycle mensuel des autres écoles ne partirait
 * jamais. Le stockage par contexte asynchrone tient sur toute la durée de
 * l'appel, y compris à travers les await.
 */
const imposee = new AsyncLocalStorage<BrandId>()

/** Exécuter `faire` comme si la marque active était `id`. */
export function sousMarque<T>(id: BrandId, faire: () => Promise<T>): Promise<T> {
  return imposee.run(id, faire)
}

const depuisLaSession = cache(async (): Promise<BrandId> => {
  const user = await getSessionUser()
  if (!user) return deploymentBrandId()

  // Les écoles où cette personne peut se tenir : toutes celles du
  // déploiement pour une direction transverse, sinon les siennes.
  const permises =
    user.brand === 'all' ? servedBrandIds() : (await mesMarques()).map(normalizeBrandId)
  if (permises.length < 2) return normalizeBrandId(user.brand === 'all' ? deploymentBrandId() : user.brand)

  const choisie = normalizeBrandId((await cookies()).get(COOKIE_MARQUE)?.value)
  if (permises.includes(choisie) && estMarqueServie(choisie)) return choisie
  return permises.includes(deploymentBrandId()) ? deploymentBrandId() : permises[0]
})

/** Les écoles entre lesquelles cette personne peut basculer. */
export async function marquesDisponibles(): Promise<BrandId[]> {
  const user = await getSessionUser()
  if (!user) return []
  const permises =
    user.brand === 'all' ? servedBrandIds() : (await mesMarques()).map(normalizeBrandId)
  return permises.filter(estMarqueServie)
}

/**
 * La marque de la requête, ou celle qu'on a imposée.
 *
 * La surcharge se lit avant le cache : une boucle qui enchaîne les écoles
 * dans une même requête doit voir changer la réponse à chaque tour.
 */
export async function activeBrandId(): Promise<BrandId> {
  return imposee.getStore() ?? (await depuisLaSession())
}

/** La configuration de la marque active. */
export async function activeBrand(): Promise<BrandConfig> {
  return BRANDS[await activeBrandId()]
}

/** À passer à `.in('brand', …)` pour une lecture de la marque active. */
export async function activeBrandScope(): Promise<['all', BrandId]> {
  return brandScopeOf(await activeBrandId())
}
