import { createServiceClient } from '@/lib/supabase/service'
import { getBrandId } from '@/lib/brand'
import { formatDateLong, money } from '@/lib/format'

/** Une catégorie que le contrat couvre déjà, et de quoi le dire. */
export interface Couverture {
  categoryId: string
  resume: string
}

/**
 * Ce que le contrat paie déjà, et qu'il ne faut donc pas déclarer.
 *
 * Un contrat de coaching se règle par échéances : elles deviennent des
 * prestations toutes seules, à leur date. Rien ne le disait au moment de
 * déclarer — Alexandra a saisi son coaching de septembre à côté de
 * l'échéance d'août, et les deux sont parties en paie. Elle s'en est
 * aperçue sur son récapitulatif, trop tard.
 *
 * On le lui dit donc là où elle risque de se tromper : sous la catégorie,
 * au moment de la choisir.
 */
export async function couvertureParContrat(providerId: string): Promise<Couverture[]> {
  const db = createServiceClient()
  const { data: contrats } = await db
    .from('inv_coaching_contracts')
    .select('id, category_id, total_ht')
    .eq('provider_id', providerId)
    .eq('brand', getBrandId())
    .eq('status', 'active')
    .not('category_id', 'is', null)
  if (!contrats?.length) return []

  const { data: echeances } = await db
    .from('inv_contract_instalments')
    .select('contract_id, due_date, amount_ht, mission_id')
    .in('contract_id', contrats.map((c) => c.id))
    .order('due_date')

  const out: Couverture[] = []
  for (const c of contrats) {
    const siennes = (echeances ?? []).filter((e) => e.contract_id === c.id)
    const suivante = siennes.find((e) => !e.mission_id)
    out.push({
      categoryId: String(c.category_id),
      resume:
        `Votre contrat couvre déjà cette prestation : ${money(Number(c.total_ht))} sur l’année, ` +
        `versés en ${siennes.length} échéance${siennes.length > 1 ? 's' : ''} qui arrivent toutes seules.` +
        (suivante
          ? ` La prochaine, ${money(Number(suivante.amount_ht))}, tombe le ${formatDateLong(suivante.due_date)}.`
          : '') +
        ' N’ajoutez pas de ligne ici : elle ferait double emploi.',
    })
  }
  return out
}
