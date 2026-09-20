import { PageHeader } from '@/components/ui/Page'
import { createServerSupabase } from '@/lib/supabase/server'
import type { AppUser } from '@/lib/types'

/**
 * Le bandeau de la page « Prestations », côté manager et admin : un seul
 * titre, et ses quatre vues en onglets dedans. Le compteur « à valider » est
 * relu à chaque affichage, c'est lui qui appelle à l'action.
 */
export async function PrestationsNav({
  user,
  current,
  title = 'Prestations',
  description = 'Validez, corrigez ou refusez les prestations de vos prestataires avant le bordereau du mois.',
  actions,
}: {
  user: AppUser
  current: string
  title?: string
  description?: string
  actions?: React.ReactNode
}) {
  const supabase = await createServerSupabase()
  let q = supabase
    .from('inv_missions')
    .select('id', { count: 'exact', head: true })
    .in('status', user.role === 'admin' ? ['submitted', 'manager_approved'] : ['submitted'])
  if (user.role === 'manager') q = q.eq('manager_id', user.id)
  const { count } = await q

  return (
    <PageHeader
      title={title}
      description={description}
      actions={actions}
      currentTab={current}
      tabs={[
        { key: 'a-valider', label: 'À valider', href: '/validation', count: count ?? 0 },
        { key: 'declarer', label: 'Déclarer pour un prestataire', href: '/validation/declarer' },
        { key: 'bordereaux', label: 'Bordereaux du mois', href: '/validation/bordereaux' },
        { key: 'historique', label: 'Historique', href: '/validation/historique' },
      ]}
    />
  )
}
