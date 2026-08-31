import { Badge } from '@/components/ui/Badge'
import { Card, PageHeader } from '@/components/ui/Page'
import { NewUserForm } from '@/components/admin/NewUserForm'
import { requireRole } from '@/lib/auth'
import { formatDate } from '@/lib/format'
import { ROLE_LABEL } from '@/lib/labels'
import { createServerSupabase } from '@/lib/supabase/server'
import type { AppUser } from '@/lib/types'
import { createUserAccount, toggleUserActive } from '../actions'

const ROLE_STYLE: Record<string, string> = {
  admin: 'bg-brand-50 text-brand-700 ring-brand-200',
  manager: 'bg-sky-50 text-sky-700 ring-sky-200',
  prestataire: 'bg-slate-100 text-slate-600 ring-slate-200',
}

export default async function UsersPage() {
  const me = await requireRole('admin')
  const supabase = await createServerSupabase()

  const { data } = await supabase
    .from('inv_users')
    .select('*')
    .order('role')
    .order('full_name')

  const users = (data ?? []) as AppUser[]

  return (
    <>
      <PageHeader
        title="Utilisateurs"
        description="Prestataires, donneurs d’ordre et administrateurs."
      />

      <div className="mb-8">
        <NewUserForm action={createUserAccount} />
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Nom</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Rôle</th>
              <th className="px-4 py-3 font-medium">Créé le</th>
              <th className="px-4 py-3 text-right font-medium">Accès</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50/70">
                <td className="px-4 py-3 font-medium text-slate-900">{u.full_name}</td>
                <td className="px-4 py-3 text-slate-600">{u.email}</td>
                <td className="px-4 py-3">
                  <Badge className={ROLE_STYLE[u.role]}>{ROLE_LABEL[u.role]}</Badge>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                  {formatDate(u.created_at)}
                </td>
                <td className="px-4 py-3 text-right">
                  {u.id === me.id ? (
                    <span className="text-xs text-slate-400">vous</span>
                  ) : (
                    <form action={toggleUserActive} className="inline">
                      <input type="hidden" name="user_id" value={u.id} />
                      <input
                        type="hidden"
                        name="is_active"
                        value={String(u.is_active)}
                      />
                      <button
                        type="submit"
                        className={`cursor-pointer rounded-lg px-2.5 py-1 text-xs font-medium ${
                          u.is_active
                            ? 'text-slate-600 hover:bg-slate-100'
                            : 'bg-red-50 text-red-700 hover:bg-red-100'
                        }`}
                      >
                        {u.is_active ? 'Désactiver' : 'Réactiver'}
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  )
}
