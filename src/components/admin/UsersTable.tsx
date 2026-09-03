'use client'

import { useState } from 'react'
import { Mail } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Page'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { formatDate } from '@/lib/format'
import { ROLE_LABEL } from '@/lib/labels'
import type { AppUser } from '@/lib/types'
import { impersonate, inviteUsers } from '@/app/(app)/admin/utilisateurs/actions'
import { toggleUserActive } from '@/app/(app)/admin/actions'

const ROLE_STYLE: Record<string, string> = {
  admin: 'bg-brand-50 text-brand-700 ring-brand-200',
  manager: 'bg-sky-50 text-sky-700 ring-sky-200',
  prestataire: 'bg-slate-100 text-slate-600 ring-slate-200',
}

export function UsersTable({ users, meId }: { users: AppUser[]; meId: string }) {
  const [selection, setSelection] = useState<Set<string>>(new Set())

  // On n'invite que des comptes actifs : un compte désactivé ne doit pas
  // recevoir de lien de connexion.
  const invitables = users.filter((u) => u.is_active && u.id !== meId)
  const tousCoches = invitables.length > 0 && invitables.every((u) => selection.has(u.id))

  function bascule(id: string) {
    setSelection((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <>
      {selection.size > 0 && (
        <form
          action={inviteUsers}
          className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50 px-5 py-3"
        >
          {[...selection].map((id) => (
            <input key={id} type="hidden" name="user_id" value={id} />
          ))}
          <span className="text-sm text-brand-900">
            <strong>{selection.size}</strong> compte{selection.size > 1 ? 's' : ''} sélectionné
            {selection.size > 1 ? 's' : ''} — chacun recevra un lien pour choisir son mot de passe.
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelection(new Set())}
              className="cursor-pointer rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-white"
            >
              Annuler
            </button>
            <SubmitButton size="sm" pendingLabel="Envoi…">
              <Mail size={14} />
              Envoyer les invitations
            </SubmitButton>
          </div>
        </form>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={tousCoches}
                    onChange={() =>
                      setSelection(tousCoches ? new Set() : new Set(invitables.map((u) => u.id)))
                    }
                    title="Tout sélectionner"
                    className="h-4 w-4 cursor-pointer accent-brand-600"
                  />
                </th>
                <th className="px-4 py-3 font-medium">Nom</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Rôle</th>
                <th className="px-4 py-3 font-medium">Créé le</th>
                <th className="px-4 py-3 text-right font-medium">Accès</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => {
                const moi = u.id === meId
                return (
                  <tr
                    key={u.id}
                    className={selection.has(u.id) ? 'bg-brand-50/60' : 'hover:bg-slate-50/70'}
                  >
                    <td className="px-4 py-3">
                      {!moi && u.is_active && (
                        <input
                          type="checkbox"
                          checked={selection.has(u.id)}
                          onChange={() => bascule(u.id)}
                          className="h-4 w-4 cursor-pointer accent-brand-600"
                        />
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {u.full_name}
                      {!u.is_active && (
                        <span className="ml-2 text-xs font-normal text-red-600">désactivé</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{u.email}</td>
                    <td className="px-4 py-3">
                      <Badge className={ROLE_STYLE[u.role]}>{ROLE_LABEL[u.role]}</Badge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {formatDate(u.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      {moi ? (
                        <p className="text-right text-xs text-slate-400">vous</p>
                      ) : (
                        <div className="flex items-center justify-end gap-1">
                          {u.is_active && (
                            <form action={inviteUsers}>
                              <input type="hidden" name="user_id" value={u.id} />
                              <button
                                type="submit"
                                title="Envoyer un lien pour créer son mot de passe"
                                className="cursor-pointer rounded-lg px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                              >
                                Inviter
                              </button>
                            </form>
                          )}
                          {u.is_active && u.role !== 'admin' && (
                            <form action={impersonate}>
                              <input type="hidden" name="user_id" value={u.id} />
                              <button
                                type="submit"
                                title="Voir la plateforme comme cette personne"
                                className="cursor-pointer rounded-lg px-2.5 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50"
                              >
                                Se connecter en tant que
                              </button>
                            </form>
                          )}
                          <form action={toggleUserActive}>
                            <input type="hidden" name="user_id" value={u.id} />
                            <input type="hidden" name="is_active" value={String(u.is_active)} />
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
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}
