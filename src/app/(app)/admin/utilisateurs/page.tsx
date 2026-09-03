import { PageHeader } from '@/components/ui/Page'
import { NewUserForm } from '@/components/admin/NewUserForm'
import { UsersTable } from '@/components/admin/UsersTable'
import { requireRole } from '@/lib/auth'
import { createServerSupabase } from '@/lib/supabase/server'
import type { AppUser } from '@/lib/types'
import { createUserAccount } from '../actions'

export default async function UsersPage() {
  const me = await requireRole('admin')
  const supabase = await createServerSupabase()

  const { data } = await supabase
    .from('inv_users')
    .select('*')
    .order('role')
    .order('full_name')

  return (
    <>
      <PageHeader
        title="Utilisateurs"
        description="Prestataires, managers et administrateurs. Cochez plusieurs lignes pour inviter en une fois."
      />

      <div className="mb-8">
        <NewUserForm action={createUserAccount} />
      </div>

      <UsersTable users={(data ?? []) as AppUser[]} meId={me.id} />
    </>
  )
}
