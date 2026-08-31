import { notFound, redirect } from 'next/navigation'
import { PageHeader } from '@/components/ui/Page'
import { MissionForm } from '@/components/missions/MissionForm'
import { requireProvider } from '@/lib/auth'
import { getManagers, getProviderCategories } from '@/lib/queries'
import { createServerSupabase } from '@/lib/supabase/server'
import type { Mission } from '@/lib/types'
import { updateMission } from '../actions'

export default async function EditMissionPage({
  params,
}: {
  params: Promise<{ missionId: string }>
}) {
  const { missionId } = await params
  const { provider } = await requireProvider()

  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('inv_missions')
    .select('*')
    .eq('id', missionId)
    .eq('provider_id', provider.id)
    .maybeSingle()

  if (!data) notFound()
  const mission = data as Mission

  // Une fois partie en validation, la prestation n'est plus modifiable :
  // c'est ce qui garantit que la facture correspond a ce qui a ete valide.
  if (!['draft', 'rejected'].includes(mission.status)) redirect('/missions')

  const [categories, managers] = await Promise.all([
    getProviderCategories(),
    getManagers(),
  ])

  return (
    <>
      <PageHeader
        title="Modifier la prestation"
        description={
          mission.status === 'rejected'
            ? 'Cette prestation a été refusée. Corrigez-la puis renvoyez-la en validation.'
            : undefined
        }
      />
      {mission.status === 'rejected' && mission.rejection_reason && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span className="font-semibold">Motif du refus :</span> {mission.rejection_reason}
        </div>
      )}
      <MissionForm
        action={updateMission}
        categories={categories}
        managers={managers}
        mission={mission}
      />
    </>
  )
}
