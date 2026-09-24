import { PROGRAMME_LABEL } from '@/lib/contracts'
import { createServiceClient } from '@/lib/supabase/service'

interface Due {
  id: string
  label: string
  due_date: string
  amount_ht: number
  contract: {
    id: string
    provider_id: string
    manager_id: string | null
    category_id: string | null
    contract_type: string
    title: string | null
    program: string | null
    academic_year: string | null
    headcount: number | null
    status: string
    pay_basis: 'brut' | 'net' | null
  } | null
}

/**
 * Transforme en prestations les échéances de contrat arrivées à terme.
 *
 * Le contrat signé tient lieu d'accord du manager : la ligne arrive
 * « validée par le manager » et part dans le bordereau du mois. Seuls les
 * contrats en cours sont concernés.
 */
export async function ouvrirEcheances(aujourdhui: string): Promise<{ ouvertes: number; ignorees: string[] }> {
  const db = createServiceClient()
  const { data } = await db
    .from('inv_contract_instalments')
    .select(
      `id, label, due_date, amount_ht,
       contract:inv_coaching_contracts(id, provider_id, manager_id, category_id, contract_type, title, program, academic_year, headcount, status, pay_basis)`
    )
    .lte('due_date', aujourdhui)
    .is('mission_id', null)

  const { data: cats } = await db.from('inv_categories').select('id, pole').eq('is_active', true).order('sort_order')
  const ignorees: string[] = []
  let ouvertes = 0
  const now = new Date().toISOString()

  for (const e of (data ?? []) as unknown as Due[]) {
    const c = e.contract
    if (!c || c.status !== 'active') continue
    const categorie = c.category_id ?? cats?.find((x) => x.pole === c.contract_type)?.id
    if (!c.manager_id || !categorie) {
      ignorees.push(`${e.label} (${c.id}) : ${!c.manager_id ? 'manager' : 'catégorie'} manquant`)
      continue
    }

    // Ce libellé part tel quel sur la facture et dans Pennylane.
    const detail = c.program
      ? `Coaching pédagogique ${PROGRAMME_LABEL[c.program] ?? c.program} — ${c.academic_year} — ${e.label.toLowerCase()}${c.headcount ? ` — ${c.headcount} étudiants suivis` : ''}`
      : `${c.title ?? 'Contrat'} — ${e.label.toLowerCase()}`

    const { data: mission, error } = await db
      .from('inv_missions')
      .insert({
        provider_id: c.provider_id,
        manager_id: c.manager_id,
        category_id: categorie,
        detail,
        start_date: e.due_date,
        end_date: e.due_date,
        pay_basis: c.pay_basis ?? null,
        pricing_type: 'forfait_mission',
        quantity: 1,
        unit_amount_ht: e.amount_ht,
        total_ht: e.amount_ht,
        status: 'manager_approved',
        origin: 'contract',
        submitted_at: now,
        manager_approved_at: now,
        manager_approved_by: c.manager_id,
      })
      .select('id')
      .single()
    if (error || !mission) {
      ignorees.push(`${e.label} (${c.id}) : ${error?.message}`)
      continue
    }
    await db.from('inv_contract_instalments').update({ mission_id: mission.id }).eq('id', e.id)
    ouvertes++
  }
  return { ouvertes, ignorees }
}
