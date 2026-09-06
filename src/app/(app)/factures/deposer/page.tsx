import { EmptyState, PageHeader } from '@/components/ui/Page'
import { DepotForm } from '@/components/depot/DepotForm'
import { requireProvider } from '@/lib/auth'
import { estLectureConfiguree } from '@/lib/invoice/extract'
import { deposerFacture } from './actions'

export default async function DeposerPage() {
  await requireProvider()

  if (!estLectureConfiguree()) {
    return (
      <>
        <PageHeader title="Déposer une facture" />
        <EmptyState
          title="Lecture automatique indisponible"
          description="Le dépôt de facture n’est pas encore activé. Déclarez vos prestations une par une depuis « Mes prestations »."
        />
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Déposer une facture"
        description="Pour les prestations que vous avez réalisées en dehors de ce qui vous a été indiqué. Nous lisons votre facture et vous indiquez qui a commandé chaque ligne."
      />
      <DepotForm action={deposerFacture} />
    </>
  )
}
