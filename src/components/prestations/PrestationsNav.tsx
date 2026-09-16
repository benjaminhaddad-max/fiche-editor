import { Tabs } from '@/components/ui/Tabs'
import { createServerSupabase } from '@/lib/supabase/server'
import type { AppUser } from '@/lib/types'

/** Les quatre vues d'une même page « Prestations », côté manager et admin. */
export async function PrestationsNav({ user, current }: { user: AppUser; current: string }) {
  const supabase = await createServerSupabase()
  let q = supabase
    .from('inv_missions')
    .select('id', { count: 'exact', head: true })
    .in('status', user.role === 'admin' ? ['submitted', 'manager_approved'] : ['submitted'])
  if (user.role === 'manager') q = q.eq('manager_id', user.id)
  const { count } = await q

  return (
    <Tabs
      current={current}
      items={[
        { key: 'a-valider', label: 'À valider', href: '/validation', count: count ?? 0 },
        { key: 'declarer', label: 'Déclarer pour un prestataire', href: '/validation/declarer' },
        { key: 'bordereaux', label: 'Bordereaux du mois', href: '/validation/bordereaux' },
        { key: 'historique', label: 'Historique', href: '/validation/historique' },
      ]}
    />
  )
}
