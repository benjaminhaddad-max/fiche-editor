import { createServerSupabase } from '@/lib/supabase/server'

/**
 * Ce qu'il faut savoir, au moment de valider une échéance, pour décider en
 * connaissance de cause : d'où vient le montant, et où en est le contrat.
 */
export interface ContractContext {
  /** Barème appliqué : « 1 000 € pour 30 étudiants par semestre ». */
  rateBaseAmount: number | null
  rateBaseHeadcount: number | null
  headcount: number | null
  /** Montant du semestre et de l'année, déduits du barème. */
  semesterAmount: number | null
  totalHt: number
  /** Rang de cette échéance et nombre total. */
  index: number
  count: number
  /** Cumul déjà réglé, et cumul une fois celle-ci payée. */
  paidBefore: number
  paidAfter: number
  program: string
  academicYear: string
}

interface InstalmentRow {
  mission_id: string | null
  sort_order: number
  amount_ht: number
  contract_id: string
  mission: { status: string; invoice_id: string | null } | null
}

/**
 * Construit le contexte contractuel de chaque prestation issue d'un contrat.
 * Renvoie une map indexée par mission_id ; les prestations hors contrat en
 * sont simplement absentes.
 */
export async function getContractContext(
  missionIds: string[]
): Promise<Map<string, ContractContext>> {
  const out = new Map<string, ContractContext>()
  if (missionIds.length === 0) return out

  const supabase = await createServerSupabase()

  const { data: liens } = await supabase
    .from('inv_contract_instalments')
    .select('mission_id, contract_id')
    .in('mission_id', missionIds)

  const contractIds = [...new Set((liens ?? []).map((l) => l.contract_id))]
  if (contractIds.length === 0) return out

  const [{ data: contrats }, { data: echeances }] = await Promise.all([
    supabase
      .from('inv_coaching_contracts')
      .select('id, program, academic_year, headcount, rate_base_amount, rate_base_headcount, total_ht')
      .in('id', contractIds),
    supabase
      .from('inv_contract_instalments')
      .select('mission_id, sort_order, amount_ht, contract_id, mission:inv_missions(status, invoice_id)')
      .in('contract_id', contractIds)
      .order('sort_order'),
  ])

  const parContrat = new Map<string, InstalmentRow[]>()
  for (const e of (echeances ?? []) as unknown as InstalmentRow[]) {
    const l = parContrat.get(e.contract_id) ?? []
    l.push(e)
    parContrat.set(e.contract_id, l)
  }

  for (const contrat of contrats ?? []) {
    const liste = (parContrat.get(contrat.id) ?? []).sort((a, b) => a.sort_order - b.sort_order)

    // « Payé » au sens comptable : l'échéance est rattachée à une facture.
    // Une échéance seulement validée ne l'est pas encore.
    let cumul = 0
    for (const e of liste) {
      const regle = Boolean(e.mission?.invoice_id)
      const avant = cumul
      if (regle) cumul += Number(e.amount_ht)

      if (e.mission_id && missionIds.includes(e.mission_id)) {
        const semestre =
          contrat.rate_base_amount && contrat.rate_base_headcount && contrat.headcount
            ? Math.round((Number(contrat.rate_base_amount) * contrat.headcount) / contrat.rate_base_headcount * 100) / 100
            : null

        out.set(e.mission_id, {
          rateBaseAmount: contrat.rate_base_amount ? Number(contrat.rate_base_amount) : null,
          rateBaseHeadcount: contrat.rate_base_headcount,
          headcount: contrat.headcount,
          semesterAmount: semestre,
          totalHt: Number(contrat.total_ht),
          index: liste.indexOf(e) + 1,
          count: liste.length,
          paidBefore: avant,
          paidAfter: avant + Number(e.amount_ht),
          program: contrat.program,
          academicYear: contrat.academic_year,
        })
      }
    }
  }

  return out
}
