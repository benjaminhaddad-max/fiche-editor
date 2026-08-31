import { PageHeader } from '@/components/ui/Page'
import { ProfileForm } from '@/components/profile/ProfileForm'
import { requireProvider } from '@/lib/auth'
import { updateProfile } from './actions'

export default async function ProfilePage() {
  const { user, provider } = await requireProvider()

  return (
    <>
      <PageHeader
        title="Mes informations"
        description="Coordonnées utilisées sur vos factures. Une facture déjà émise n’est pas modifiée si vous changez ces informations."
      />
      <ProfileForm action={updateProfile} provider={provider} email={user.email} />
    </>
  )
}
