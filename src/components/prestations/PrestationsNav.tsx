import { PageHeader } from '@/components/ui/Page'
import { ongletsDuMois } from '@/components/layout/onglets-du-mois'
import { activeCycle } from '@/lib/cycle'
import { createServerSupabase } from '@/lib/supabase/server'
import type { AppUser } from '@/lib/types'
import { getBrandId } from '@/lib/brand'

/**
 * Le bandeau du mois, côté manager et admin : un seul titre, et toutes les
 * vues du mois en onglets dedans — validation, bordereaux, factures, paie.
 * Le compteur « à valider » est relu à chaque affichage, c'est lui qui
 * appelle à l'action.
 */
export async function PrestationsNav({
  user,
  current,
  title = 'Prestations',
  description = 'Tout le mois au même endroit : ce qui est à valider, ce qui part en bordereau, et ce qui se paie.',
  mois,
  actions,
}: {
  user: AppUser
  current: string
  title?: string
  description?: string
  /** Le mois affiché, pour que les onglets de rémunération y restent. */
  mois?: string
  actions?: React.ReactNode
}) {
  const supabase = await createServerSupabase()
  let q = supabase
    .from('inv_missions')
    .select('id', { count: 'exact', head: true })
    .eq('brand', getBrandId())
    .in('status', user.role === 'admin' ? ['submitted', 'manager_approved'] : ['submitted'])
  if (user.role === 'manager') q = q.eq('manager_id', user.id)
  const { count } = await q

  return (
    <PageHeader
      title={title}
      description={description}
      actions={actions}
      currentTab={current}
      tabs={ongletsDuMois(user.role, count ?? 0, mois ?? activeCycle().month)}
    />
  )
}
