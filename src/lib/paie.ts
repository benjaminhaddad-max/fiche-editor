import { createServiceClient } from '@/lib/supabase/service'
import type { Employment, MissionKind } from '@/lib/types'
import { getBrandId } from '@/lib/brand'

export interface LignePaie {
  id: string
  personne: string
  statut: Employment
  kind: MissionKind
  detail: string
  date: string
  quantity: number
  unit: number
  total: number
  /** Brut ou net : la paie doit savoir ce qu'elle lit. */
  base: 'brut' | 'net'
  /** Pourcentage retiré du montant convenu, du fait du contrat. */
  abattement: number
  categorie: string
  manager: string
  status: string
}

/**
 * Une ligne acquise : son manager l'a validée.
 *
 * Il n'y a pas de deuxième validation. Le geste de l'administration, c'est
 * l'envoi lui-même — le bordereau chez Pennylane pour les indépendants, le
 * récapitulatif au social pour les salariés. Tant qu'on exigeait un clic de
 * plus par ligne, une prestation validée par son manager s'affichait
 * « en attente admin » et ne partait pas, alors que plus personne
 * n'attendait rien.
 */
export const estAcquise = (status: string) =>
  status === 'manager_approved' || status === 'approved'

/**
 * Éléments de paie d'un mois : prestations et bonus des vacataires et
 * alternants, validés ou en cours de validation, pas encore envoyés.
 */
/**
 * Les éléments variables à porter sur les bulletins.
 *
 * On ne filtre pas sur le mois du travail, mais sur tout ce qui n'est pas
 * encore parti en paie et dont la date ne dépasse pas la fin de période.
 * La nuance a coûté cher : une prestation de juillet déclarée en septembre
 * — un rattrapage, ou simplement un retard — ne tombait dans aucune fenêtre,
 * puisque juillet était clos et que septembre ne la voyait pas. Elle
 * n'apparaissait nulle part et n'aurait jamais atteint un bulletin.
 *
 * C'est la règle que suivent déjà les bordereaux des indépendants : ce qui
 * traîne est ramassé au passage, jamais oublié.
 *
 * `avecEnvoyees` rouvre ce qui est déjà parti, pour relire un mois clos.
 */
export async function lignesPaie(debut: string, fin: string, opts: { avecEnvoyees?: boolean } = {}): Promise<LignePaie[]> {
  const db = createServiceClient()
  let q = db
    .from('inv_missions')
    .select(
      `id, kind, detail, start_date, quantity, unit_amount_ht, total_ht, abatement_rate, status, pay_basis, payroll_batch_id,
       provider:inv_providers!inner(legal_name, employment_type),
       category:inv_categories(name),
       manager:inv_users!inv_missions_manager_id_fkey(full_name)`
    )
    .eq('brand', getBrandId())
    .neq('provider.employment_type', 'independant')
    .lte('start_date', fin)
    .in('status', ['submitted', 'manager_approved', 'approved', 'invoiced'])
    .order('start_date')
  // Relire un mois déjà clos : là, on borne des deux côtés, sinon on
  // ramasserait tout l'historique.
  if (opts.avecEnvoyees) q = q.gte('start_date', debut)
  else q = q.is('payroll_batch_id', null)
  const { data } = await q
  return ((data ?? []) as unknown as {
    id: string
    kind: MissionKind
    detail: string
    start_date: string
    quantity: number
    unit_amount_ht: number
    total_ht: number
    status: string
    pay_basis: 'brut' | 'net' | null
    abatement_rate: number
    provider: { legal_name: string; employment_type: Employment }
    category: { name: string } | null
    manager: { full_name: string } | null
  }[])
    .map((m) => ({
      id: m.id,
      personne: m.provider.legal_name,
      statut: m.provider.employment_type,
      kind: m.kind,
      detail: m.detail,
      date: m.start_date,
      quantity: Number(m.quantity),
      unit: Number(m.unit_amount_ht),
      total: Number(m.total_ht),
      base: (m.pay_basis === 'net' ? 'net' : 'brut') as 'brut' | 'net',
      abattement: Number(m.abatement_rate ?? 0),
      categorie: m.category?.name ?? '—',
      manager: m.manager?.full_name ?? '—',
      status: m.status,
    }))
    .sort((a, b) => a.personne.localeCompare(b.personne, 'fr') || a.date.localeCompare(b.date))
}
