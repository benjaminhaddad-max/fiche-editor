'use client'

import { useActionState, useMemo, useState } from 'react'
import { Mail, Plus, Search, X } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Page'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { ROLE_LABEL } from '@/lib/labels'
import type { AppUser } from '@/lib/types'
import { envoyerInvitationsEtRappels, type EnvoiResultat } from '@/app/(app)/admin/utilisateurs/actions'
import { ImpersonateButton } from '@/components/auth/ImpersonateButton'
import { changerEtiquette, setUserPhone, toggleUserActive } from '@/app/(app)/admin/actions'
import Link from 'next/link'
import { EMPLOYMENT_LABEL } from '@/lib/labels'
import type { Employment } from '@/lib/types'

const ROLE_STYLE: Record<string, string> = {
  admin: 'bg-gold/10 text-gold-dark ring-gold/30',
  manager: 'bg-sky-50 text-sky-700 ring-sky-200',
  prestataire: 'bg-cream-deep text-navy/70 ring-line',
}

export type EquipeRow = AppUser & {
  phone?: string | null
  providerId?: string | null
  employment?: Employment | null
  onboarding?: boolean
  tags?: string[]
}

export function UsersTable({
  users,
  meId,
  plateforme = [],
}: {
  users: EquipeRow[]
  meId: string
  /** Tous les comptes actifs, pour pouvoir relancer au-delà de l'onglet. */
  plateforme?: { id: string; full_name: string }[]
}) {
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [envoi, envoyer] = useActionState<EnvoiResultat | null, FormData>(envoyerInvitationsEtRappels, null)
  const [recherche, setRecherche] = useState('')
  const [etiquette, setEtiquette] = useState('')

  // Toutes les étiquettes en usage, pour proposer de filtrer dessus.
  const etiquettes = useMemo(() => {
    const c = new Map<string, number>()
    for (const u of users) for (const t of u.tags ?? []) c.set(t, (c.get(t) ?? 0) + 1)
    return [...c.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr'))
  }, [users])

  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    return users.filter(
      (u) =>
        (!etiquette || (u.tags ?? []).includes(etiquette)) &&
        (!q ||
          u.full_name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          (u.phone ?? '').toLowerCase().includes(q) ||
          (u.tags ?? []).some((t) => t.toLowerCase().includes(q)))
    )
  }, [users, recherche, etiquette])

  // On n'invite que des comptes actifs : un compte désactivé ne doit pas
  // recevoir de lien de connexion.
  const invitables = visibles.filter((u) => u.is_active && u.id !== meId)
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
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[16rem] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone" />
          <input
            type="search"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher un nom, un email, un téléphone, une étiquette…"
            className="field pl-9"
          />
          {recherche && (
            <button
              type="button"
              onClick={() => setRecherche('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-stone hover:text-navy"
              aria-label="Effacer la recherche"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <p className="text-xs text-muted">
          {visibles.length} / {users.length}
        </p>
      </div>

      {etiquettes.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setEtiquette('')}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              etiquette === '' ? 'border-navy bg-navy text-cream' : 'border-line bg-white text-navy/70 hover:border-gold/40'
            }`}
          >
            Toutes
          </button>
          {etiquettes.map(([t, n]) => (
            <button
              key={t}
              type="button"
              onClick={() => setEtiquette(etiquette === t ? '' : t)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                etiquette === t ? 'border-navy bg-navy text-cream' : 'border-line bg-white text-navy/70 hover:border-gold/40'
              }`}
            >
              {t}
              <span className={`ml-1.5 font-normal ${etiquette === t ? 'text-cream/60' : 'text-muted'}`}>{n}</span>
            </button>
          ))}
        </div>
      )}

      {plateforme.length > 0 && selection.size < plateforme.length && (
        <p className="mb-3 text-xs text-muted">
          <button
            type="button"
            onClick={() => setSelection(new Set(plateforme.map((p) => p.id)))}
            className="cursor-pointer font-medium text-gold-dark hover:underline"
          >
            Sélectionner les {plateforme.length} comptes actifs de la plateforme
          </button>{' '}
          — prestataires, salariés et managers, tous onglets confondus.
        </p>
      )}

      {selection.size > 0 && (
        <form
          action={envoyer}
          className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold/40 bg-gold/10 px-5 py-3"
        >
          {[...selection].map((id) => (
            <input key={id} type="hidden" name="user_id" value={id} />
          ))}
          <span className="max-w-2xl text-sm text-navy">
            <strong>{selection.size}</strong> compte{selection.size > 1 ? 's' : ''} sélectionné
            {selection.size > 1 ? 's' : ''}. Chacun recevra le message de son statut ; ceux qui ne se sont jamais
            connectés recevront en plus leur lien d’accès.
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelection(new Set())}
              className="cursor-pointer rounded-lg px-3 py-1.5 text-sm text-navy/70 hover:bg-white"
            >
              Annuler
            </button>
            <SubmitButton size="sm" pendingLabel="Envoi…">
              <Mail size={14} />
              Envoyer invitations et rappels
            </SubmitButton>
          </div>
        </form>
      )}

      {envoi?.message && (
        <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{envoi.message}</p>
      )}
      {envoi?.error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{envoi.error}</p>}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-cream-muted text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={tousCoches}
                    onChange={() =>
                      setSelection(tousCoches ? new Set() : new Set(invitables.map((u) => u.id)))
                    }
                    title="Tout sélectionner"
                    className="h-4 w-4 cursor-pointer accent-navy"
                  />
                </th>
                <th className="px-4 py-3 font-medium">Nom</th>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Rôle</th>
                <th className="px-4 py-3 text-right font-medium">Accès</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {visibles.map((u) => {
                const moi = u.id === meId
                return (
                  <tr
                    key={u.id}
                    className={selection.has(u.id) ? 'bg-gold/10/60' : 'hover:bg-cream-muted'}
                  >
                    <td className="px-4 py-3">
                      {!moi && u.is_active && (
                        <input
                          type="checkbox"
                          checked={selection.has(u.id)}
                          onChange={() => bascule(u.id)}
                          className="h-4 w-4 cursor-pointer accent-navy"
                        />
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium text-navy">
                      {u.full_name}
                      {!u.is_active && (
                        <span className="ml-2 text-xs font-normal text-red-600">désactivé</span>
                      )}
                      {u.providerId && <Etiquettes providerId={u.providerId} tags={u.tags ?? []} connues={etiquettes.map(([t]) => t)} />}
                    </td>
                    <td className="px-4 py-3 text-navy/70">
                      {u.email}
                      {u.role === 'prestataire' ? (
                        u.phone && <span className="block text-xs text-muted">{u.phone}</span>
                      ) : (
                        <form action={setUserPhone} className="mt-1 flex items-center gap-1">
                          <input type="hidden" name="user_id" value={u.id} />
                          <input
                            name="phone"
                            defaultValue={u.phone ?? ''}
                            placeholder="Téléphone (SMS)"
                            className="w-36 rounded border border-line px-2 py-0.5 text-xs"
                            aria-label="Téléphone"
                          />
                          <button type="submit" className="cursor-pointer text-xs text-gold-dark hover:underline">
                            OK
                          </button>
                        </form>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={ROLE_STYLE[u.role]}>{ROLE_LABEL[u.role]}</Badge>
                      {u.employment && (
                        <span className="mt-1 block text-xs text-muted">{EMPLOYMENT_LABEL[u.employment]}</span>
                      )}
                      {u.providerId && (
                        <Link href={`/admin/prestataires/${u.providerId}`} className="mt-1 block text-xs font-medium text-gold-dark hover:underline">
                          Fiche{u.onboarding === false ? ' · infos manquantes' : ''}
                        </Link>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {moi ? (
                        <p className="text-right text-xs text-stone">vous</p>
                      ) : (
                        <div className="flex items-center justify-end gap-1">
                          {u.is_active && (
                            <button
                              type="button"
                              onClick={() => setSelection(new Set([u.id]))}
                              title="Le sélectionner pour lui envoyer son accès et le rappel du mois"
                              className="cursor-pointer rounded-lg px-2.5 py-1 text-xs font-medium text-navy/70 hover:bg-cream-deep"
                            >
                              Relancer
                            </button>
                          )}
                          {u.is_active && u.role !== 'admin' && (
                            <ImpersonateButton userId={u.id} />
                          )}
                          <form action={toggleUserActive}>
                            <input type="hidden" name="user_id" value={u.id} />
                            <input type="hidden" name="is_active" value={String(u.is_active)} />
                            <button
                              type="submit"
                              className={`cursor-pointer rounded-lg px-2.5 py-1 text-xs font-medium ${
                                u.is_active
                                  ? 'text-navy/70 hover:bg-cream-deep'
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

/**
 * Les étiquettes d'une fiche : on en pose une en écrivant, on la retire
 * d'un clic. Les étiquettes déjà en usage sont proposées pour éviter
 * qu'une faute de frappe en crée une deuxième.
 */
function Etiquettes({
  providerId,
  tags,
  connues,
}: {
  providerId: string
  tags: string[]
  connues: string[]
}) {
  const [ouvert, setOuvert] = useState(false)

  return (
    <span className="mt-1 flex flex-wrap items-center gap-1">
      {tags.map((t) => (
        <form key={t} action={changerEtiquette} className="inline-flex">
          <input type="hidden" name="provider_id" value={providerId} />
          <input type="hidden" name="tag" value={t} />
          <input type="hidden" name="retirer" value="1" />
          <button
            type="submit"
            title={`Retirer « ${t} »`}
            className="group inline-flex cursor-pointer items-center gap-1 rounded-full bg-cream-deep px-2 py-0.5 text-[11px] font-medium text-navy/75 hover:bg-red-50 hover:text-red-700"
          >
            {t}
            <X size={10} className="opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        </form>
      ))}

      {ouvert ? (
        <form action={changerEtiquette} className="inline-flex items-center gap-1">
          <input type="hidden" name="provider_id" value={providerId} />
          <input
            name="tag"
            list="ds-etiquettes"
            autoFocus
            maxLength={40}
            placeholder="étiquette"
            className="w-28 rounded border border-line px-1.5 py-0.5 text-[11px] focus:border-gold focus:outline-none"
            onBlur={(e) => !e.target.value && setOuvert(false)}
          />
          <datalist id="ds-etiquettes">
            {connues.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setOuvert(true)}
          title="Ajouter une étiquette"
          className="inline-flex cursor-pointer items-center rounded-full border border-dashed border-line px-1.5 py-0.5 text-[11px] text-muted hover:border-gold hover:text-navy"
        >
          <Plus size={10} />
        </button>
      )}
    </span>
  )
}
