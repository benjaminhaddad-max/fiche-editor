import { cycleForDate } from '@/lib/cycle'
import { createServiceClient } from '@/lib/supabase/service'
import { brandScope, getBrandId } from '@/lib/brand'
import { montantVerse, tauxAbattement } from '@/lib/abattement'
import type { Pole } from '@/lib/types'

/**
 * Forfaits mensuels : un contrat freelance à 500 € par mois n'a pas à être
 * ressaisi tous les mois. Le dernier jour du mois, la prestation est créée
 * d'office, déjà validée par le responsable du contrat — elle part donc dans
 * le bordereau du 1er avec le reste.
 *
 * Idempotent : `monthly_last_run` empêche de la créer deux fois.
 */
export async function ouvrirForfaitsMensuels(aujourdhui: string): Promise<{ ouverts: number; ignores: string[] }> {
  const db = createServiceClient()
  const cycle = cycleForDate(aujourdhui)
  const ignores: string[] = []
  let ouverts = 0

  // Le dernier jour du mois seulement : avant, le contrat peut encore être rompu.
  if (aujourdhui !== cycle.periodEnd) return { ouverts, ignores }

  const { data } = await db
    .from('inv_coaching_contracts')
    .select('id, provider_id, manager_id, category_id, title, rate_amount, start_date, end_date, monthly_last_run')
    .eq('brand', getBrandId())
    .eq('monthly_auto', true)
    .eq('status', 'active')
    .lte('start_date', cycle.periodEnd)

  // L'abattement de contrat s'appliquait partout sauf ici : un forfait
  // mensuel partait au montant plein, même pour un salarié dont le contrat
  // prévoit une retenue. Personne ne l'aurait vu, le montant convenu et le
  // montant versé étant identiques sur la ligne.
  const [{ data: fiches }, { data: cats }] = await Promise.all([
    db.from('inv_providers').select('id, pay_abatement, abatement_exempt_poles').eq('brand', getBrandId()),
    db.from('inv_categories').select('id, pole').in('brand', brandScope()),
  ])
  const fiche = new Map((fiches ?? []).map((f) => [f.id as string, f]))
  const poleDe = new Map((cats ?? []).map((x) => [x.id as string, x.pole as Pole]))

  for (const c of data ?? []) {
    if (c.monthly_last_run && c.monthly_last_run >= cycle.periodStart) continue
    if (c.end_date && c.end_date < cycle.periodStart) continue
    if (!c.manager_id || !c.category_id || !c.rate_amount) {
      ignores.push(`${c.title ?? c.id} : responsable, catégorie ou montant manquant`)
      continue
    }

    const now = new Date().toISOString()
    const abattu = tauxAbattement(fiche.get(c.provider_id) ?? {}, poleDe.get(c.category_id))
    const { error } = await db.from('inv_missions').insert({
      provider_id: c.provider_id,
      manager_id: c.manager_id,
      category_id: c.category_id,
      detail: `Forfait mensuel — ${cycle.label}`,
      start_date: cycle.periodEnd,
      end_date: cycle.periodEnd,
      pricing_type: 'forfait_mission',
      quantity: 1,
      unit_amount_ht: c.rate_amount,
      abatement_rate: abattu,
      total_ht: montantVerse(Number(c.rate_amount), abattu),
      status: 'manager_approved',
      origin: 'contract',
      declared_by: c.manager_id,
      submitted_at: now,
      manager_approved_at: now,
      manager_approved_by: c.manager_id,
    })
    if (error) {
      ignores.push(`${c.title ?? c.id} : ${error.message}`)
      continue
    }
    await db.from('inv_coaching_contracts').update({ monthly_last_run: cycle.periodEnd }).eq('id', c.id)
    ouverts++
  }
  return { ouverts, ignores }
}
