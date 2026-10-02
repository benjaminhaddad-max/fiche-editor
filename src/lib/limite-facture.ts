import { activeCycle, todayParis } from '@/lib/cycle'
import { createServiceClient } from '@/lib/supabase/service'
import { getBrandId } from '@/lib/brand'

/**
 * La date à laquelle la facture est vraiment attendue.
 *
 * Le calendrier la calcule : bordereau le 1er, facture sous deux jours. Mais
 * c'est le bordereau qui fait foi, et il porte sa propre date — en octobre,
 * parti le 2 au lieu du 1er, il laissait jusqu'au dimanche 4. L'écran de
 * facturation lisait le bordereau et annonçait le 4 ; le calendrier juste
 * à côté calculait et annonçait le 2. Deux dates sur la même page.
 *
 * Sans bordereau émis, il n'y a rien à lire : le calcul reprend la main.
 */
export async function limiteFacture(providerId: string | null): Promise<string | undefined> {
  if (!providerId) return undefined
  const { data } = await createServiceClient()
    .from('inv_statements')
    .select('invoice_deadline, provider:inv_providers!inner(brand)')
    .eq('provider_id', providerId)
    .eq('provider.brand', getBrandId())
    .order('cycle_month', { ascending: false })
    .limit(1)
    .maybeSingle()

  const limite = (data as { invoice_deadline?: string } | null)?.invoice_deadline
  // Un bordereau du mois dernier ne dit rien du mois en cours.
  return limite && limite >= activeCycle(todayParis()).statementDate ? limite : undefined
}
