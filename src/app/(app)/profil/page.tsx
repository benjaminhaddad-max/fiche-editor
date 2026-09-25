import { PageHeader } from '@/components/ui/Page'
import { isSalaried } from '@/lib/types'
import { ProfileForm } from '@/components/profile/ProfileForm'
import { requireProvider } from '@/lib/auth'
import { updateProfile } from './actions'

export default async function ProfilePage() {
  const { user, provider } = await requireProvider()

  return (
    <>
      <PageHeader
        title="Mes informations"
        description={
          isSalaried(provider.employment_type)
            ? 'Vous êtes sous contrat : vous n’émettez aucune facture. Ces coordonnées servent à votre dossier.'
            : 'Coordonnées utilisées sur vos factures. Une facture déjà émise n’est pas modifiée si vous changez ces informations.'
        }
      />
      <ProfileForm action={updateProfile} provider={provider} email={user.email} />
    </>
  )
}
