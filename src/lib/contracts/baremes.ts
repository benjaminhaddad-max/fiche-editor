import { bareme } from '@/lib/contracts/enregistrement'
import { createServiceClient } from '@/lib/supabase/service'
import type { TarifPersonne } from '@/components/missions/DeclarationForm'

/**
 * Les barèmes négociés, prestataire par prestataire.
 *
 * Ils viennent du contrat : celui qui déclare une vacation n'a plus à se
 * souvenir si c'est 25 ou 30 € les deux heures — il clique sur la durée.
 */
export async function baremesParPrestataire(): Promise<Record<string, TarifPersonne>> {
  const db = createServiceClient()
  const { data } = await db
    .from('inv_coaching_contracts')
    .select('provider_id, profile, rate_type, rate_amount')
    .eq('status', 'active')
    .not('profile', 'is', null)

  const out: Record<string, TarifPersonne> = {}
  for (const c of data ?? []) {
    const cle = String(c.profile).replace(/^enregistrement_/, '')
    const b = bareme(cle)
    if (b) {
      out[c.provider_id] = { resume: b.resume, paliers: b.paliers.map((p) => ({ label: p.label, montant: p.montant })) }
    } else if (c.rate_amount && c.rate_type !== 'forfait') {
      const unite = c.rate_type === 'horaire' ? 'de l’heure' : c.rate_type === 'mensuel' ? 'par mois' : 'par mission'
      out[c.provider_id] = {
        resume: `${Number(c.rate_amount).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })} ${unite}`,
        paliers: [{ label: 'Tarif du contrat', montant: Number(c.rate_amount) }],
      }
    }
  }
  return out
}
