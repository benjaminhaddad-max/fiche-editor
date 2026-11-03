import { createServiceClient } from '@/lib/supabase/service'
import { activeBrandId } from '@/lib/brand/actif'

/**
 * Ce que Ben allume ou éteint pour les justificatifs, sans redéploiement.
 *
 * Les valeurs par défaut sont les prudentes, sauf le dépôt automatique : il
 * n'écrit que dans Pennylane, sur un mouvement qui réclame justement une
 * pièce, et seulement quand un seul mouvement a exactement le montant du
 * reçu. L'envoi de l'état au comptable, lui, reste éteint tant que Ben ne
 * l'a pas allumé.
 */
export interface ReglagesJustificatifs {
  /** Un rapprochement sûr part tout seul dans Pennylane. */
  depotAuto: boolean
  /** L'état du 5 part par mail. */
  envoiEtat: boolean
  /** À qui il part. Vide : il ne part pas, même allumé. */
  destinataireEtat: string
}

const DEFAUTS: ReglagesJustificatifs = { depotAuto: true, envoiEtat: false, destinataireEtat: '' }
const CLE = 'justificatifs'

export async function lireReglages(): Promise<ReglagesJustificatifs> {
  const { data } = await createServiceClient()
    .from('inv_reglages')
    .select('valeur')
    .eq('brand', await activeBrandId())
    .eq('cle', CLE)
    .maybeSingle()
  return { ...DEFAUTS, ...((data?.valeur as Partial<ReglagesJustificatifs> | undefined) ?? {}) }
}

export async function ecrireReglages(r: ReglagesJustificatifs, par: string): Promise<void> {
  await createServiceClient()
    .from('inv_reglages')
    .upsert({ brand: await activeBrandId(), cle: CLE, valeur: r, updated_at: new Date().toISOString(), updated_by: par })
}
