'use client'

import { useActionState, useMemo, useState } from 'react'
import { Plus, Search, Trash2 } from 'lucide-react'
import { clsx } from 'clsx'
import { Select } from '@/components/ui/Field'
import { Card } from '@/components/ui/Page'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { cycleForDate, cycleForMonth, enVerification, providerCanDeclare } from '@/lib/cycle'
import { money, round2 } from '@/lib/format'
import { POLE_LABEL } from '@/lib/labels'
import { correspondPrestataire } from '@/lib/recherche-prestataire'
import type { DeclarationResult } from '@/app/(app)/declarations/actions'
import type { Employment, Pole, PricingType } from '@/lib/types'

export interface DeclCategory {
  id: string
  label: string
  pole: Pole
  /** Enseignement soumis à Qualiopi : la déclaration se fait séance par séance. */
  requiresSession?: boolean
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
  /** Le créneau réel de la séance, et ce qu'elle couvre — exigences Qualiopi. */
  start_time: string
  end_time: string
  groupe: string
  subject: string
  modality: string
  location: string
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
  /** Ce que le contrat paie déjà, et qu'il ne faut donc pas redéclarer. */
  couvertures?: { categoryId: string; resume: string }[]
  /** Sans TVA, « HT » ne veut rien dire : c'est le montant payé, point. */
  sansTva?: boolean
  /** Ce qui est retenu sur le montant convenu, catégorie par catégorie. */
  abattements?: Record<string, number>
  /** Pourquoi on retient : les charges du contrat, ou la TVA du portage. */
  motifAbattement?: 'contrat' | 'TVA'
  today: string
  deadlineText: string
}

/** Suggestions de formation : le champ reste libre, on ne fait qu'aider. */
const FORMATIONS = ['PASS', 'LAS', 'LSPS', 'PAES', 'Terminale Santé', 'Prépa concours', 'BTS']

const MODALITES = [
  { valeur: 'presentiel', label: 'Présentiel' },
  { valeur: 'distanciel', label: 'Distanciel' },
  { valeur: 'hybride', label: 'Hybride' },
]

/**
 * La durée d'un créneau, en heures décimales.
 *
 * C'est elle qui alimente la quantité facturée quand on est payé à l'heure :
 * un créneau de 9 h 00 à 12 h 30 vaut 3,5 — retaper « 3,5 » à côté du
 * créneau reviendrait à saisir deux fois la même chose, et à laisser les
 * deux diverger.
 */
function dureeHeures(debut: string, fin: string): number | null {
  const m = /^(\d{2}):(\d{2})$/
  const d = m.exec(debut)
  const f = m.exec(fin)
  if (!d || !f) return null
  const minutes = (Number(f[1]) * 60 + Number(f[2])) - (Number(d[1]) * 60 + Number(d[2]))
  return minutes > 0 ? round2(minutes / 60) : null
}

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
  // Plusieurs centaines de prestataires : on tape un bout de nom pour réduire
  // la liste. Le prestataire déjà choisi reste toujours dans les options.
  const [rechercheProvider, setRechercheProvider] = useState('')
  const providersAffiches = useMemo(
    () => (providers ?? []).filter((p) => p.id === providerId || correspondPrestataire(p.name, rechercheProvider)),
    [providers, providerId, rechercheProvider]
  )
  const [managerParDefaut, setManagerParDefaut] = useState(props.defaultManagerId ?? '')
  const employment: Employment =
    mode === 'prestataire'
      ? (props.employment ?? 'independant')
      : (providers?.find((p) => p.id === providerId)?.employment ?? 'independant')
  const salarie = employment !== 'independant'
  const tarif = mode === 'prestataire' ? props.tarifs?.['moi'] : props.tarifs?.[providerId]
  // Les 56 indépendants de l'école sont en franchise : aucun ne facture de
  // TVA. « Total HT » les fait tous buter sur la même question — faut-il
  // retirer quelque chose ? Non : c'est ce qu'ils touchent.
  const sansTva = props.sansTva === true
  const couvertePar = (categoryId: string) =>
    props.couvertures?.find((c) => c.categoryId === categoryId)?.resume ?? null

  const categorieParDefaut =
    categories.find((c) => c.pole === props.defaultPole)?.id ?? ''

  // Une séance se compte à l'heure : c'est le seul mode où le créneau saisi
  // et la quantité facturée disent la même chose.
  const tarifPour = (catId: string): PricingType =>
    categories.find((c) => c.id === catId)?.requiresSession ? 'forfait_horaire' : 'forfait_mission'

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
    pricing_type: tarifPour(categorieParDefaut),
    quantity: '1',
    unit_amount_ht: '',
    start_time: '',
    end_time: '',
    groupe: '',
    subject: '',
    modality: '',
    location: '',
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

  // Ce qui est convenu, et ce qui sera réellement porté : le formulaire
  // n'affichait que le premier, et une retenue de 20 % n'apparaissait nulle
  // part avant le récapitulatif. On déclare 3 200 € et on en voit 2 560 sur
  // sa fiche de paie, sans jamais avoir vu passer le calcul.
  const retenue = (categoryId: string) => props.abattements?.[categoryId] ?? 0
  const verse = (l: Ligne) =>
    round2((Number(l.quantity) || 0) * (Number(l.unit_amount_ht) || 0) * (1 - retenue(l.category_id) / 100))
  const convenu = useMemo(
    () => round2(lignes.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_amount_ht) || 0), 0)),
    [lignes]
  )
  // `verse` se reconstruit à chaque rendu : on dépend de ce qu'il lit.
  const total = useMemo(
    () => round2(lignes.reduce((s, l) => s + verse(l), 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lignes, props.abattements]
  )
  const motif = props.motifAbattement ?? 'contrat'

  const parPole = useMemo(() => {
    const g = new Map<Pole, DeclCategory[]>()
    for (const c of categories) g.set(c.pole, [...(g.get(c.pole) ?? []), c])
    return [...g.entries()]
  }, [categories])

  const serialisees = JSON.stringify(
    // La clé ne sert qu'au rendu : tout le reste part au serveur, y compris
    // les champs de séance ajoutés depuis.
    lignes.map((l) => {
      const { cle, ...reste } = l
      void cle
      return reste
    })
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
            <div className="flex flex-col gap-2">
            <Select
              id="provider_id"
              name="provider_id"
              label="Prestataire"
              hint={
                rechercheProvider.trim()
                  ? `${providersAffiches.length} prestataire${providersAffiches.length > 1 ? 's' : ''} correspond${providersAffiches.length > 1 ? 'ent' : ''}`
                  : undefined
              }
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
              required
            >
              <option value="" disabled>
                Choisir…
              </option>
              {providersAffiches.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.employment !== 'independant' ? ` (${p.employment})` : ''}
                </option>
              ))}
            </Select>
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone" />
              <input
                type="search"
                value={rechercheProvider}
                onChange={(e) => {
                  const v = e.target.value
                  setRechercheProvider(v)
                  // Un seul nom correspond : il est choisi d'office.
                  const seuls = (providers ?? []).filter((p) => correspondPrestataire(p.name, v))
                  if (v.trim() && seuls.length === 1) setProviderId(seuls[0].id)
                }}
                onKeyDown={(e) => {
                  // Entrée soumettrait toute la déclaration.
                  if (e.key === 'Enter') e.preventDefault()
                }}
                placeholder="Rechercher un prestataire…"
                aria-label="Rechercher un prestataire"
                className="field"
                // `.field` est hors des couches Tailwind : un `pl-9` serait écrasé.
                style={{ paddingLeft: '2.25rem' }}
              />
            </div>
            </div>
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
            const seance = categories.find((c) => c.id === l.category_id)?.requiresSession === true
            const duree = dureeHeures(l.start_time, l.end_time)
            // Le créneau commande la quantité quand on est payé à l'heure :
            // deux saisies du même nombre finiraient par diverger.
            const majCreneau = (patch: Partial<Ligne>) => {
              const debut = patch.start_time ?? l.start_time
              const fin = patch.end_time ?? l.end_time
              const h = dureeHeures(debut, fin)
              maj(l.cle, {
                ...patch,
                ...(h !== null && l.pricing_type === 'forfait_horaire' ? { quantity: String(h) } : {}),
              })
            }
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
                      onChange={(e) => {
                        const cat = categories.find((c) => c.id === e.target.value)
                        maj(l.cle, {
                          category_id: e.target.value,
                          pricing_type: cat?.requiresSession ? 'forfait_horaire' : l.pricing_type,
                        })
                      }}
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
                    {couvertePar(l.category_id) && (
                      <p className="mt-1.5 rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
                        {couvertePar(l.category_id)}
                      </p>
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
                    {/* Le même interrupteur sert à deux situations qui ne se
                        ressemblent pas : déclarer un mois déjà clos, et
                        déclarer le mois en cours une fois la vérification
                        commencée. Il se nomme donc d'après celle où l'on se
                        trouve — sinon personne ne s'y reconnaît. */}
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
                      <span>
                        {enVerification(l.date, today)
                          ? 'Déclaration tardive : le mois est en vérification'
                          : 'Rattrapage d’un mois passé'}
                      </span>
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
                      <p className="mt-1 rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
                        {enVerification(l.date, today) ? (
                          <>
                            {cycleForDate(l.date).label} est en vérification : les managers relisent.
                            Cochez « déclaration tardive » juste au-dessus pour l’ajouter quand même —
                            votre manager la verra avec les autres.
                          </>
                        ) : (
                          <>
                            {cycleForDate(l.date).label} est clos : cochez « rattrapage d’un mois
                            passé » juste au-dessus pour l’ajouter quand même.
                          </>
                        )}
                      </p>
                    )}
                  </Champ>


                  {seance && (
                    <div className="lg:col-span-12">
                      <div className="rounded-lg border border-gold/40 bg-gold/5 p-3 sm:p-4">
                        <p className="mb-1 text-xs font-semibold text-navy">Détail de la séance</p>
                        <p className="mb-3 text-xs text-muted">
                          Une ligne par séance. Le créneau, le groupe, le module et la modalité sont
                          demandés par Qualiopi pour prouver que la séance a bien eu lieu : un total
                          d’heures sur le mois ne suffit pas lors d’un audit.
                        </p>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-12">
                          <Champ label="Début" className="lg:col-span-2">
                            <input
                              type="time"
                              className="field w-full"
                              value={l.start_time}
                              onChange={(e) => majCreneau({ start_time: e.target.value })}
                              aria-label="Heure de début"
                            />
                          </Champ>
                          <Champ label="Fin" className="lg:col-span-2">
                            <input
                              type="time"
                              className="field w-full"
                              value={l.end_time}
                              onChange={(e) => majCreneau({ end_time: e.target.value })}
                              aria-label="Heure de fin"
                            />
                          </Champ>
                          <Champ label="Groupe ou classe" className="lg:col-span-4">
                            <input
                              className="field w-full"
                              value={l.groupe}
                              maxLength={120}
                              placeholder="Ex : BTS 1re année — groupe A"
                              onChange={(e) => maj(l.cle, { groupe: e.target.value })}
                              aria-label="Groupe ou classe"
                            />
                          </Champ>
                          <Champ label="Module ou matière" className="lg:col-span-4">
                            <input
                              className="field w-full"
                              value={l.subject}
                              maxLength={160}
                              placeholder="Ex : Culture générale et expression"
                              onChange={(e) => maj(l.cle, { subject: e.target.value })}
                              aria-label="Module ou matière"
                            />
                          </Champ>
                          <Champ label="Modalité" className="lg:col-span-4">
                            <select
                              className="field w-full"
                              value={l.modality}
                              onChange={(e) => maj(l.cle, { modality: e.target.value })}
                              aria-label="Modalité"
                            >
                              <option value="">Choisir…</option>
                              {MODALITES.map((m) => (
                                <option key={m.valeur} value={m.valeur}>
                                  {m.label}
                                </option>
                              ))}
                            </select>
                          </Champ>
                          <Champ label="Lieu ou salle" className="lg:col-span-8">
                            <input
                              className="field w-full"
                              value={l.location}
                              maxLength={160}
                              placeholder={l.modality === 'distanciel' ? 'Ex : Teams' : 'Ex : Campus Paris — salle 204'}
                              onChange={(e) => maj(l.cle, { location: e.target.value })}
                              aria-label="Lieu ou salle"
                            />
                          </Champ>
                        </div>
                        {duree !== null && (
                          <p className="mt-2 text-xs text-navy/75">
                            Durée de la séance : <strong>{duree.toString().replace('.', ',')} h</strong>
                            {l.pricing_type === 'forfait_horaire' && ' — reportée dans les heures facturées.'}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

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
                      aria-label={sansTva ? 'Prix unitaire' : 'Prix unitaire HT'}
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
                  {retenue(l.category_id) > 0 ? (
                    <>
                      <span className="text-muted">{money(ligneTotal)} convenus</span>
                      {` − ${retenue(l.category_id)} % (${motif}) → `}
                      <strong className="font-display">{money(verse(l))}</strong>
                    </>
                  ) : (
                    <>
                      Total de la ligne : <strong className="font-display">{money(ligneTotal)}</strong>
                      {!sansTva && ' HT'}
                    </>
                  )}
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
                  pricing_type: tarifPour(ls.at(-1)?.category_id ?? categorieParDefaut),
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
            Total : <strong>{money(total)}</strong>
            {convenu !== total ? (
              <span className="ml-2 text-xs font-normal text-muted">
                {money(convenu)} convenus, moins {motif === 'TVA' ? 'la TVA' : 'les charges du contrat'}
              </span>
            ) : sansTva ? (
              <span className="ml-2 text-xs font-normal text-muted">
                vous n’avez pas de TVA : c’est le montant qui vous sera payé
              </span>
            ) : (
              ' HT'
            )}
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
