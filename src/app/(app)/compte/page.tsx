import { PageHeader } from '@/components/ui/Page'
import { IdentityForm, PasswordForm } from '@/components/account/AccountForms'
import { requireUser } from '@/lib/auth'
import { ROLE_LABEL } from '@/lib/labels'
import { changePassword, updateOwnName } from './actions'

export default async function AccountPage() {
  const user = await requireUser()

  return (
    <>
      <PageHeader
        title="Mon compte"
        description="Vos accès à Diploma Invoice."
      />
      <div className="flex flex-col gap-6">
        <IdentityForm
          action={updateOwnName}
          fullName={user.full_name}
          email={user.email}
          role={ROLE_LABEL[user.role]}
        />
        <PasswordForm action={changePassword} />
      </div>
    </>
  )
}
