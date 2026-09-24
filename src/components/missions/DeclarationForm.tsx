'use client'

import { useActionState, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { clsx } from 'clsx'
import { Select } from '@/components/ui/Field'
import { Card } from '@/components/ui/Page'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { cycleForDate, cycleForMonth, providerCanDeclare } from '@/lib/cycle'
import { money, round2 } from '@/lib/format'
import { POLE_LABEL } from '@/lib/labels'
import type { DeclarationResult } from '@/app/(app)/declarations/actions'
import type { Employment, Pole, PricingType } from '@/lib/types'

export interface DeclCategory {
  id: string
  label: string
  pole: Pole
}

interface Ligne {
  cle: number
  category_id: string
  manager_id: string
  pay_basis: 'brut' | 'net'
  formation: string
  regularisation: boolean
  regul_period: string
  detail: string
  date: string
  kind: 'prestation' | 'bonus'
  pricing_type: PricingType
  quantity: string
  unit_amount_ht: string
}

export interface TarifPersonne {
  resume: string
  paliers: { label: string; montant: number }[]
}

interface Props {
  action: (prev: DeclarationResult, fd: FormData) => Promise<DeclarationResult>
  /** Barèmes négociés, par prestataire : évite de retaper les montants. */
  tarifs?: Record<string, TarifPersonne>
  mode: 'prestataire' | 'manager' | 'admin'
  categories: DeclCategory[]
  managers: { id: string; full_name: string }[]
  providers?: { id: string; name: string; employment: Employment }[]
  defaultManagerId?: string | null
  defaultPole?: Pole
  employment?: Employment
  today: string
  deadlineText: string
}

/** Suggestions de formation : le champ reste libre, on ne fait qu'aider. */
const FORMATIONS = ['PASS', 'LAS', 'LSPS', 'PAES', 'Terminale Santé', 'Prépa concours']

/** Ce qu'on compte, et comment on l'écrit à côté des champs. */
const UNITE: Record<PricingType, { quantite: string; pluriel: string; prix: string }> = {
  forfait_mission: { quantite: 'Quantité', pluriel: 'missions', prix: '€ / mission' },
  forfait_journalier: { quantite: 'Journées', pluriel: 'journées', prix: '€ / journée' },
  forfait_horaire: { quantite: 'Heures', pluriel: 'heures', prix: '€ / heure' },
}

/** Les douze derniers mois, pour dire quelle période on rattrape. */
function MOIS_RECENTS(today: string) {
  const [a, m] = today.slice(0, 7).split('-').map(Number)
  return Array.from({ length: 13 }, (_, i) => {
    const d = new Date(Date.UTC(a, m - 1 - i, 1))
    const valeur = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    return { valeur, label: cycleForMonth(valeur).label }
  })
}

/** Un champ et son intitulé : sur une fiche, rien ne doit rester muet. */
function Champ({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <label className={clsx('block', className)}>
      <span className="mb-1 block text-xs font-medium text-navy/75">{label}</span>
      {children}
    </label>
  )
}

let compteur = 0

export function DeclarationForm(props: Props) {
  const { action, mode, categories, managers, providers, today } = props
  const [state, formAction] = useActionState<DeclarationResult, FormData>(action, {})
  const [providerId, setProviderId] = useState('')
  const [managerParDefaut, setManagerParDefaut] = useState(props.defaultManagerId ?? '')
  const employment: Employment =
    mode === 'prestataire'
      ? (props.employment ?? 'independant')
      : (providers?.find((p) => p.id === providerId)?.employment ?? 'independant')
  const salarie = employment !== 'independant'
  const tarif = mode === 'prestataire' ? props.tarifs?.['moi'] : props.tarifs?.[providerId]

  const categorieParDefaut =
    categories.find((c) => c.pole === props.defaultPole)?.id ?? ''

  const nouvelle = (): Ligne => ({
    cle: ++compteur,
    category_id: categorieParDefaut,
    manager_id: '',
    pay_basis: 'brut',
    formation: '',
    regularisation: false,
    regul_period: '',
    detail: '',
    date: today,
    kind: 'prestation',
    pricing_type: 'forfait_mission',
    quantity: '1',
    unit_amount_ht: '',
  })

  const [lignes, setLignes] = useState<Ligne[]>(() => [nouvelle()])

  // Une déclaration enregistrée repart d'une page vierge. Ajusté pendant le
  // rendu, à la réception d'un nouveau résultat, plutôt que dans un effet.
  const [resultatVu, setResultatVu] = useState(state)
  if (state !== resultatVu) {
    setResultatVu(state)
    if (state.success) setLignes([nouvelle()])
  }

  const maj = (cle: number, patch: Partial<Ligne>) =>
    setLignes((ls) => ls.map((l) => (l.cle === cle ? { ...l, ...patch } : l)))

  const total = useMemo(
    () => round2(lignes.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_amount_ht) || 0), 0)),
    [lignes]
  )

  const parPole = useMemo(() => {
    const g = new Map<Pole, DeclCategory[]>()
    for (const c of categories) g.set(c.pole, [...(g.get(c.pole) ?? []), c])
    return [...g.entries()]
  }, [categories])

  const serialisees = JSON.stringify(
    lignes.map(({ category_id, manager_id, pay_basis, formation, regularisation, regul_period, detail, date, kind, pricing_type, quantity, unit_amount_ht }) => ({
      category_id,
      manager_id,
      pay_basis,
      formation,
      regularisation,
      regul_period,
      detail,
      date,
      kind,
      pricing_type,
      quantity,
      unit_amount_ht,
    }))
  )

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="lignes" value={serialisees} />
      <datalist id="ds-formations">
        {FORMATIONS.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>

      <Card className="p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          {mode !== 'prestataire' && (
            <Select
              id="provider_id"
              name="provider_id"
              label="Prestataire"
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
              required
            >
              <option value="" disabled>
                Choisir…
              </option>
              {providers?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.employment !== 'independant' ? ` (${p.employment})` : ''}
                </option>
              ))}
            </Select>
          )}
          {mode === 'manager' ? (
            <input type="hidden" name="manager_id" value={props.defaultManagerId ?? ''} />
          ) : (
            <Select
              id="manager_id"
              name="manager_id"
              label={mode === 'prestataire' ? 'Manager par défaut' : 'Manager rattaché'}
              value={managerParDefaut}
              onChange={(e) => setManagerParDefaut(e.target.value)}
              required
            >
              <option value="" disabled>
                Choisir…
              </option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name}
                </option>
              ))}
            </Select>
          )}
        </div>
        <p className="mt-3 text-xs text-muted">{props.deadlineText}</p>
        {tarif && (
          <p className="mt-1 text-xs text-navy/70">
            Barème négocié : <strong>{tarif.resume}</strong>. Les boutons sous le prix remplissent le montant.
          </p>
        )}
      </Card>

      <Card className="overflow-hidden">
        {/* Une fiche par ligne, empilée en colonne quand l'écran est étroit.
            Le tableau d'avant faisait mille trois cents pixels de large : sur
            une tablette, la colonne du prix sortait de l'écran et personne ne
            trouvait où écrire son montant. */}
        <div className="divide-y divide-line/60">
          {lignes.map((l, i) => {
            const erreur = state.lineErrors?.[i]
            const ligneTotal = round2((Number(l.quantity) || 0) * (Number(l.unit_amount_ht) || 0))
            return (
              <div key={l.cle} className="p-4 sm:p-5">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">Ligne {i + 1}</p>
                  <button
                    type="button"
                    onClick={() => setLignes((ls) => (ls.length > 1 ? ls.filter((x) => x.cle !== l.cle) : ls))}
                    disabled={lignes.length === 1}
                    title="Supprimer la ligne"
                    className="cursor-pointer rounded p-1.5 text-muted hover:bg-red-50 hover:text-red-700 disabled:opacity-30"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>

                <div className="grid gap-3 lg:grid-cols-12">
                  <Champ label="Type de prestation" className="lg:col-span-4">
                    <select
                      className="field w-full"
                      value={l.category_id}
                      onChange={(e) => maj(l.cle, { category_id: e.target.value })}
                      aria-label="Type de prestation"
                    >
                      <option value="" disabled>
                        Choisir…
                      </option>
                      {parPole.map(([pole, cats]) => (
                        <optgroup key={pole} label={POLE_LABEL[pole]}>
                          {cats.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.label}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    {salarie && (
                      <label className="mt-1.5 flex items-center gap-1.5 text-xs text-navy/70">
                        <input
                          type="checkbox"
                          checked={l.kind === 'bonus'}
                          onChange={(e) =>
                            maj(l.cle, {
                              kind: e.target.checked ? 'bonus' : 'prestation',
                              quantity: e.target.checked ? '1' : l.quantity,
                            })
                          }
                          className="accent-navy"
                        />
                        C’est un bonus
                      </label>
                    )}
                  </Champ>

                  {mode !== 'manager' && (
                    <Champ label="Confiée par" className="lg:col-span-4">
                      <select
                        className="field w-full"
                        value={l.manager_id}
                        onChange={(e) => maj(l.cle, { manager_id: e.target.value })}
                        aria-label="Manager qui a confié cette mission"
                      >
                        <option value="">Manager par défaut</option>
                        {managers.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.full_name}
                          </option>
                        ))}
                      </select>
                    </Champ>
                  )}

                  <Champ label="Formation concernée" className="lg:col-span-4">
                    <input
                      className="field w-full"
                      list="ds-formations"
                      value={l.formation}
                      maxLength={120}
                      placeholder="Ex : PASS"
                      onChange={(e) => maj(l.cle, { formation: e.target.value })}
                      aria-label="Formation concernée"
                    />
                  </Champ>

                  <Champ label="Ce que vous avez fait" className="lg:col-span-12">
                    <input
                      className="field w-full"
                      value={l.detail}
                      maxLength={500}
                      placeholder={l.kind === 'bonus' ? 'Ex : prime objectifs septembre' : 'Ex : TD Anatomie — groupe B'}
                      onChange={(e) => maj(l.cle, { detail: e.target.value })}
                      aria-label="Désignation"
                    />
                    {erreur && <p className="mt-1 text-xs text-red-600">{erreur}</p>}
                  </Champ>

                  <Champ label="Date" className="lg:col-span-3">
                    <input
                      type="date"
                      className="field w-full"
                      value={l.date}
                      onChange={(e) => maj(l.cle, { date: e.target.value })}
                      aria-label="Date"
                    />
                    <label className="mt-1.5 flex items-start gap-1.5 text-xs text-navy/70">
                      <input
                        type="checkbox"
                        checked={l.regularisation}
                        onChange={(e) =>
                          maj(l.cle, {
                            regularisation: e.target.checked,
                            regul_period: e.target.checked ? l.regul_period || l.date.slice(0, 7) : '',
                          })
                        }
                        className="mt-0.5 accent-navy"
                      />
                      <span>Rattrapage d’un mois passé</span>
                    </label>
                    {l.regularisation && (
                      <select
                        className="field mt-1 w-full text-xs"
                        value={l.regul_period || l.date.slice(0, 7)}
                        onChange={(e) => maj(l.cle, { regul_period: e.target.value })}
                        aria-label="Mois rattrapé"
                      >
                        {MOIS_RECENTS(today).map((m) => (
                          <option key={m.valeur} value={m.valeur}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    )}
                    {mode === 'prestataire' && !providerCanDeclare(l.date, today) && !l.regularisation && (
                      <p className="mt-1 text-xs text-amber-700">
                        {cycleForDate(l.date).label} est clos : cochez « rattrapage ».
                      </p>
                    )}
                  </Champ>

                  <Champ label="Compté" className="lg:col-span-3">
                    {l.kind === 'bonus' ? (
                      <p className="field w-full bg-cream-muted text-muted">Montant fixe</p>
                    ) : (
                      <select
                        className="field w-full"
                        value={l.pricing_type}
                        onChange={(e) => maj(l.cle, { pricing_type: e.target.value as PricingType })}
                        aria-label="Tarification"
                      >
                        <option value="forfait_mission">À la mission</option>
                        <option value="forfait_journalier">À la journée</option>
                        <option value="forfait_horaire">À l’heure</option>
                      </select>
                    )}
                  </Champ>

                  <Champ label={UNITE[l.pricing_type].quantite} className="lg:col-span-2">
                    <input
                      type="number"
                      step="0.25"
                      min="0.25"
                      className="field w-full"
                      value={l.quantity}
                      disabled={l.kind === 'bonus'}
                      onChange={(e) => maj(l.cle, { quantity: e.target.value })}
                      aria-label={UNITE[l.pricing_type].quantite}
                    />
                  </Champ>

                  <Champ
                    label={l.kind === 'bonus' ? 'Montant en euros' : `Prix ${UNITE[l.pricing_type].prix}`}
                    className="lg:col-span-4"
                  >
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="field w-full"
                      value={l.unit_amount_ht}
                      placeholder="0,00"
                      onChange={(e) => maj(l.cle, { unit_amount_ht: e.target.value })}
                      aria-label="Prix unitaire HT"
                    />
                    {salarie && (
                      <label className="mt-1.5 flex items-center gap-1.5 text-xs text-navy/70">
                        <input
                          type="checkbox"
                          checked={l.pay_basis === 'net'}
                          onChange={(e) => maj(l.cle, { pay_basis: e.target.checked ? 'net' : 'brut' })}
                          className="accent-navy"
                        />
                        Montant net
                      </label>
                    )}
                    {tarif && l.kind !== 'bonus' && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {tarif.paliers.map((pal) => (
                          <button
                            key={pal.label}
                            type="button"
                            title={`${pal.label} — ${money(pal.montant)}`}
                            onClick={() =>
                              maj(l.cle, {
                                unit_amount_ht: String(pal.montant),
                                quantity: '1',
                                detail: l.detail || pal.label,
                              })
                            }
                            className="cursor-pointer rounded border border-line bg-white px-2 py-0.5 text-xs text-navy/70 hover:border-gold hover:bg-gold/10"
                          >
                            {pal.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </Champ>
                </div>

                <p className="mt-3 text-right text-sm text-navy">
                  Total de la ligne : <strong className="font-display">{money(ligneTotal)}</strong> HT
                </p>
              </div>
            )
          })}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-cream-muted px-4 py-3">
          <button
            type="button"
            onClick={() =>
              setLignes((ls) => [
                ...ls,
                {
                  ...nouvelle(),
                  category_id: ls.at(-1)?.category_id ?? categorieParDefaut,
                  manager_id: ls.at(-1)?.manager_id ?? '',
                  date: ls.at(-1)?.date ?? today,
                },
              ])
            }
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-medium text-navy hover:bg-cream"
          >
            <Plus size={15} />
            Ajouter une ligne
          </button>
          <p className="text-sm text-navy">
            Total : <strong>{money(total)} HT</strong>
          </p>
        </div>
      </Card>

      {state.error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</p>}
      {state.success && (
        <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{state.success}</p>
      )}

      <div className="flex flex-wrap justify-end gap-3">
        {mode === 'prestataire' && (
          <SubmitButton name="intent" value="draft" variant="secondary" pendingLabel="Enregistrement…">
            Enregistrer en brouillon
          </SubmitButton>
        )}
        <SubmitButton name="intent" value="submit" pendingLabel="Envoi…">
          {mode === 'prestataire' ? 'Envoyer en validation' : 'Déclarer et valider'}
        </SubmitButton>
      </div>
    </form>
  )
}
