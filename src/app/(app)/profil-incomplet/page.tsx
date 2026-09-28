import { EmptyState, PageHeader } from '@/components/ui/Page'
import { requireUser } from '@/lib/auth'
import { brand } from '@/lib/brand'

export default async function ProfilIncompletPage() {
  const user = await requireUser()

  return (
    <>
      <PageHeader title="Compte en cours de configuration" />
      <EmptyState
        title="Votre fiche prestataire n’est pas encore créée"
        description={`Votre compte (${user.email}) existe, mais l’administration ${brand().company.name} doit encore créer votre fiche de facturation. Contactez votre interlocuteur habituel : cela prend une minute de son côté.`}
      />
    </>
  )
}
