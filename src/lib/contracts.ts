import { POLE_LABEL, RATE_TYPE_LABEL } from '@/lib/labels'
import { money } from '@/lib/format'
import type { ContractRateType, Pole } from '@/lib/types'

export const PROGRAMME_LABEL: Record<string, string> = {
  pass_las_lsps: 'PASS / LAS / LSPS',
  paes: 'PAES',
  terminale_sante: 'Terminale Santé',
}

export const CONTRACT_STATUS_LABEL: Record<string, string> = {
  draft: 'Brouillon',
  active: 'En cours',
  ended: 'Terminé',
  cancelled: 'Annulé',
}

export interface ContractRow {
  id: string
  contract_type: Pole
  title: string | null
  program: string | null
  classes_label: string | null
  academic_year: string | null
  start_date: string | null
  end_date: string | null
  rate_type: ContractRateType
  rate_amount: number | null
  headcount: number | null
  rate_base_amount: number | null
  rate_base_headcount: number | null
  total_ht: number
  status: string
  conditions: string | null
  document_path: string | null
  profile: string | null
  sent_at: string | null
  signed_at: string | null
  signer_name: string | null
  monthly_auto: boolean
  provider?: { id: string; legal_name: string } | null
  manager?: { full_name: string } | null
  instalments?: { id: string; label: string; amount_ht: number; due_date: string; mission_id: string | null }[]
}

export const CONTRACT_SELECT = `
  id, contract_type, title, program, classes_label, academic_year, start_date, end_date,
  rate_type, rate_amount, headcount, rate_base_amount, rate_base_headcount, total_ht,
  status, conditions, document_path, profile, sent_at, signed_at, signer_name, monthly_auto,
  provider:inv_providers(id, legal_name),
  manager:inv_users!inv_coaching_contracts_manager_id_fkey(full_name),
  instalments:inv_contract_instalments(id, label, amount_ht, due_date, mission_id)
`

/** Intitulé lisible, quel que soit le type de contrat. */
export function contractTitle(c: Pick<ContractRow, 'title' | 'program' | 'classes_label' | 'contract_type'>): string {
  if (c.title) return c.title
  if (c.program) {
    return `Coaching ${PROGRAMME_LABEL[c.program] ?? c.program}${c.classes_label ? ` — ${c.classes_label}` : ''}`
  }
  return `Contrat ${POLE_LABEL[c.contract_type].toLowerCase()}`
}

/** « 1 000 € pour 30 étudiants par semestre », « 45 € de l’heure »… */
export function contractRate(c: ContractRow): string {
  if (c.rate_base_amount && c.rate_base_headcount) {
    return `${money(c.rate_base_amount)} pour ${c.rate_base_headcount} étudiants par semestre${c.headcount ? ` · ${c.headcount} suivis` : ''}`
  }
  if (c.rate_amount) {
    const unite = { forfait: '', mission: ' par mission', horaire: ' de l’heure', mensuel: ' par mois' }[c.rate_type]
    return `${money(c.rate_amount)}${unite}`
  }
  return RATE_TYPE_LABEL[c.rate_type]
}
