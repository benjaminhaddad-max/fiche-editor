import { PageHeader } from '@/components/ui/Page'
import { MissionForm } from '@/components/missions/MissionForm'
import { requireProvider } from '@/lib/auth'
import { getManagers, getProviderCategories } from '@/lib/queries'
import { createMission } from '../actions'

export default async function NewMissionPage() {
  const { provider } = await requireProvider()
  const [categories, managers] = await Promise.all([
    getProviderCategories(),
    getManagers(),
  ])

  return (
    <>
      <PageHeader
        title="Déclarer une prestation"
        description="Une prestation validée par votre donneur d’ordre puis par l’administration devient facturable."
      />
      <MissionForm
        action={createMission}
        categories={categories}
        managers={managers}
        defaultManagerId={provider.default_manager_id}
      />
    </>
  )
}
