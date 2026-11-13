import { aVerifier } from '@/lib/invoice/ecart'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Parmi ces factures, celles qui sont « À vérifier » : écart de montant
 * constaté et pas encore validé par un administrateur. Aucun chemin de
 * paiement (bouton, envoi en comptabilité, relecture Pennylane, tâche
 * planifiée) ne doit toucher à celles-ci.
 */
export async function facturesAVerifier(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const { data } = await createServiceClient()
    .from('inv_invoices')
    .select('id, ai_check, ecart_valide_at')
    .in('id', ids)
  return new Set(
    ((data ?? []) as { id: string; ai_check: never; ecart_valide_at: string | null }[])
      .filter((f) => aVerifier(f))
      .map((f) => f.id)
  )
}
