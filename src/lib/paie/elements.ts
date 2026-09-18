import type { BillingCycle } from '@/lib/cycle'
import { createServiceClient } from '@/lib/supabase/service'
import type { Employment } from '@/lib/types'

export interface LigneElements {
  providerId: string
  nom: string
  statut: Employment
  email: string | null
  rempli: boolean
  heuresSup: number
  congesPayes: number
  congesSansSolde: number
  detailConges: string | null
  transport: boolean
  montantTransport: number | null
  justificatifId: string | null
  mutuelle: string
  commentaire: string | null
  relanceLe: string | null
  transmisLe: string | null
}

/**
 * Les éléments variables du mois, personne par personne : ce que le service
 * paie réclamait par email, et qui manque encore.
 */
export async function elementsDuMois(cycle: BillingCycle): Promise<LigneElements[]> {
  const db = createServiceClient()
  const [{ data: fiches }, { data: saisies }] = await Promise.all([
    db
      .from('inv_providers')
      .select('id, legal_name, employment_type, user:inv_users!inv_providers_user_id_fkey(full_name, email, is_active)')
      .neq('employment_type', 'independant'),
    db.from('inv_payroll_inputs').select('*').eq('period', cycle.month),
  ])

  const parProvider = new Map((saisies ?? []).map((s) => [s.provider_id as string, s]))

  return ((fiches ?? []) as unknown as {
    id: string
    legal_name: string
    employment_type: Employment
    user: { full_name: string; email: string; is_active: boolean } | null
  }[])
    .filter((f) => !f.user || f.user.is_active)
    .map((f) => {
      const s = parProvider.get(f.id)
      return {
        providerId: f.id,
        nom: f.user?.full_name ?? f.legal_name,
        statut: f.employment_type,
        email: f.user?.email ?? null,
        rempli: Boolean(s?.submitted_at),
        heuresSup: Number(s?.overtime_hours ?? 0),
        congesPayes: Number(s?.paid_leave_days ?? 0),
        congesSansSolde: Number(s?.unpaid_leave_days ?? 0),
        detailConges: (s?.leave_detail as string | null) ?? null,
        transport: Boolean(s?.transport),
        montantTransport: s?.transport_amount === null || s?.transport_amount === undefined ? null : Number(s.transport_amount),
        justificatifId: (s?.transport_document as string | null) ?? null,
        mutuelle: (s?.mutuelle as string) ?? 'inconnu',
        commentaire: (s?.comment as string | null) ?? null,
        relanceLe: (s?.reminded_at as string | null) ?? null,
        transmisLe: (s?.exported_at as string | null) ?? null,
      }
    })
    .sort((a, b) => Number(a.rempli) - Number(b.rempli) || a.nom.localeCompare(b.nom, 'fr'))
}
