import type { createServiceClient } from '@/lib/supabase/service'
import type { BrandId } from '@/lib/brand'

/**
 * Relance ceux dont la facture du mois manque, pour une seule école.
 *
 * `inv_statements` n'a pas de colonne d'école : elle se lit sur le
 * prestataire. Sans ce filtre, la tâche quotidienne, qui se joue une fois par
 * école, relançait tout le monde à chaque tour : le 2 novembre, 18 personnes
 * ont reçu trois mails et trois SMS en trois minutes.
 */
export async function relancerFactures(
  db: ReturnType<typeof createServiceClient>,
  mois: string,
  ecole: BrandId,
  relancer: (statementId: string) => Promise<boolean>
): Promise<{ relances: number }> {
  const { data } = await db
    .from('inv_statements')
    .select('id, provider:inv_providers!inner(brand)')
    .eq('cycle_month', mois)
    .eq('provider.brand', ecole)
    .in('status', ['sent', 'contested', 'accepted'])
    .is('invoice_id', null)
  let relances = 0
  for (const s of data ?? []) if (await relancer(s.id)) relances++
  return { relances }
}
