import { activeBrandId } from '@/lib/brand/actif'
import type { createServiceClient } from '@/lib/supabase/service'
import { isSalaried, type Employment } from '@/lib/types'

type Db = ReturnType<typeof createServiceClient>

/**
 * Une personne est soit prestataire (facture), soit salariée (fiche de paie),
 * jamais les deux (Shirel, 26/11/2026).
 *
 * La base le garantit (déclencheur t_inv_providers_exclusivite, migration
 * 64) : une fiche ne peut pas être créée ni changer de côté si la même
 * personne — même compte, même email, même numéro de sécurité sociale ou
 * même nom — existe déjà de l'autre côté. Ce module lit son message et
 * permet de vérifier avant de créer quoi que ce soit.
 */

const PREFIXE = 'EXCLUSIVITE:'

/** Le message du déclencheur, lisible tel quel ; null si l'erreur est autre. */
export function messageExclusivite(message: string | null | undefined): string | null {
  if (!message) return null
  const i = message.indexOf(PREFIXE)
  return i === -1 ? null : message.slice(i + PREFIXE.length).trim()
}

/** Le message d'une erreur de la base, celui de l'exclusivité débarrassé de son préfixe. */
export function texteErreur(message: string | null | undefined): string {
  return messageExclusivite(message) ?? message ?? 'erreur inconnue'
}

export interface AutreCote {
  provider_id: string
  legal_name: string
  lien: string
}

/** Avant de créer une fiche : la même personne existe-t-elle déjà de l'autre côté ? */
export async function dejaDeLAutreCote(
  db: Db,
  p: { nom: string; email?: string | null; employment: Employment | string; nir?: string | null }
): Promise<string | null> {
  const salarie = isSalaried(p.employment as Employment)
  const { data } = await db.rpc('inv_autre_cote', {
    p_id: '00000000-0000-0000-0000-000000000000',
    p_brand: await activeBrandId(),
    p_salarie: salarie,
    p_user: null,
    p_email: (p.email ?? '').trim().toLowerCase(),
    p_nir: (p.nir ?? '').replace(/\s/g, ''),
    p_nom: p.nom,
  })
  const autre = ((data ?? []) as AutreCote[])[0]
  if (!autre) return null
  return `${p.nom} existe déjà côté ${salarie ? 'prestataire' : 'salarié'} (fiche « ${autre.legal_name} », ${autre.lien}). Une personne est soit prestataire (facture), soit salariée (fiche de paie), jamais les deux.`
}
