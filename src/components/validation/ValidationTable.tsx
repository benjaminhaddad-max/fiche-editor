'use client'

import { Fragment, useActionState, useState } from 'react'
import { ArrowRightLeft, Check, ChevronRight, Pencil, X } from 'lucide-react'
import { clsx } from 'clsx'
import {
  approveMission,
  basculerAbattement,
  corrigerMission,
  reattribuerMissions,
  rejectMission,
  type CorrectionResultat,
  type TransfertResultat,
} from '@/app/(app)/validation/actions'
import { Card } from '@/components/ui/Page'
import { formatDate, formatDateLong, formatPeriod, money } from '@/lib/format'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { MODALITE_LABEL, PRICING_LABEL, PRICING_UNIT } from '@/lib/labels'

/** « 09:00:00 » venu de Postgres se lit « 09h00 ». */
const heure = (t: string | null | undefined) => (t ? t.slice(0, 5).replace(':', 'h') : '')
import type { PricingType } from '@/lib/types'
import type { ContractContext } from '@/lib/contract-context'

export interface ReviewMission {
  id: string
  detail: string
  formation: string | null
  regularisation: boolean
  regul_period: string | null
  /** Sa fiche prévoit-elle un abattement ? Sinon, rien à lever. */
  abattable?: boolean
  /** Sous contrat : il ne facture pas, sa ligne part au service paie. */
  salarie?: boolean
  /** Qui a posé la validation manager, et quand. Vide si personne encore. */
  manager_approved_at?: string | null
  valide_par?: string | null
  /** Détail de séance, quand l'enseignement est soumis à Qualiopi. */
  start_time?: string | null
  end_time?: string | null
  groupe?: string | null
  subject?: string | null
  modality?: string | null
  location?: string | null
  manager_id: string | null
  abatement_rate: number
  start_date: string
  end_date: string | null
  pricing_type: PricingType
  quantity: number
  unit_amount_ht: number
  total_ht: number
  category_name: string
  provider_name: string
  manager_name: string
  contract?: ContractContext
}

const PROGRAMME: Record<string, string> = {
  pass_las_lsps: 'PASS / LAS / LSPS',
  paes: 'PAES',
  terminale_sante: 'Terminale Santé',
}

/**
 * Le raisonnement complet derrière le montant : le barème, l'effectif, ce que
 * ça donne sur l'année, et où en est le contrat une fois cette échéance payée.
 */
function ContractBreakdown({ c }: { c: ContractContext }) {
  const reste = c.totalHt - c.paidAfter
  const pct = c.totalHt > 0 ? Math.round((c.paidAfter / c.totalHt) * 100) : 0

  return (
    <div className="mt-2 rounded-lg border border-line bg-cream-muted px-3 py-2.5 text-xs">
      {c.rateBaseAmount && c.rateBaseHeadcount && c.headcount ? (
        <p className="text-navy/80">
          Barème {PROGRAMME[c.program] ?? c.program} :{' '}
          <strong>{money(c.rateBaseAmount)} pour {c.rateBaseHeadcount} étudiants</strong> par semestre.
          {' '}Ce coach en suit <strong>{c.headcount}</strong> →{' '}
          {money(c.semesterAmount ?? 0)} par semestre, soit{' '}
          <strong>{money(c.totalHt)} sur l’année</strong>.
        </p>
      ) : (
        <p className="text-navy/80">
          Forfait négocié : <strong>{money(c.totalHt)}</strong> sur l’année.
        </p>
      )}

      <p className="mt-1.5 text-navy/80">
        Échéance <strong>{c.index} sur {c.count}</strong>. Déjà réglé :{' '}
        {money(c.paidBefore)}. Après celle-ci :{' '}
        <strong>{money(c.paidAfter)} sur {money(c.totalHt)}</strong>
        {reste > 0 ? ` — il restera ${money(reste)}.` : ' — contrat soldé.'}
      </p>

      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-cream-deep">
        <div className="h-full rounded-full bg-navy" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function ValidationTable({
  missions,
  showManager,
  managers = [],
  moi,
}: {
  missions: ReviewMission[]
  showManager?: boolean
  /** Pour réattribuer une prestation au bon manager depuis la correction. */
  managers?: { id: string; full_name: string }[]
  /** Qui regarde : on ne se propose pas à soi-même comme destinataire. */
  moi?: string
}) {
  // Corriger, transférer, refuser : trois volets sous la même ligne. Un seul
  // à la fois, sinon on ne sait plus lequel on est en train de remplir.
  const [volet, setVolet] = useState<{ id: string; quoi: 'corriger' | 'confier' | 'refuser' } | null>(null)
  const ouvrir = (id: string, quoi: 'corriger' | 'confier' | 'refuser') =>
    setVolet((v) => (v?.id === id && v.quoi === quoi ? null : { id, quoi }))
  const editing = volet?.quoi === 'corriger' ? volet.id : null
  const confier = volet?.quoi === 'confier' ? volet.id : null
  const rejecting = volet?.quoi === 'refuser' ? volet.id : null
  const setEditing = (id: string | null) => setVolet(id ? { id, quoi: 'corriger' } : null)
  const setRejecting = (id: string | null) => setVolet(id ? { id, quoi: 'refuser' } : null)
  const setConfier = (id: string | null) => setVolet(id ? { id, quoi: 'confier' } : null)
  const [correction, setCorrection] = useState<(CorrectionResultat & { id: string }) | null>(null)
  // Le détail se déplie à la demande. Tout afficher d'emblée donnait des
  // lignes de cinq hauteurs : on ne voyait plus que six prestations à
  // l'écran, et il fallait défiler pour en juger vingt.
  const [ouvert, setOuvert] = useState<Set<string>>(new Set())
  const basculerDetail = (id: string) =>
    setOuvert((p) => {
      const n = new Set(p)
      if (n.has(id)) {
        n.delete(id)
        // Replier ferme aussi le formulaire ouvert dessous : sinon le détail
        // se rouvrait de lui-même et le repli semblait sans effet.
        setVolet((v) => (v?.id === id ? null : v))
      } else n.add(id)
      return n
    })
  const [transfert, transferer] = useActionState<TransfertResultat | null, FormData>(
    reattribuerMissions,
    null
  )
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [qui, setQui] = useState('')

  // Un manager qui a dix prestataires devant lui les traite un par un :
  // sans ce filtre, il relit la même liste entière à chaque fois.
  // Toutes ces lignes sont-elles déjà passées par leur manager ? Si oui, le
  // geste attendu ici n'est plus « valider » mais « bon à payer » : garder le
  // même mot faisait croire que le manager n'avait rien fait.
  const dejaVues = missions.length > 0 && missions.every((m) => Boolean(m.manager_approved_at))
  // Un salarié ne facture pas : sa ligne ne devient pas « bon à payer »,
  // elle part au service paie. Le mot doit le dire.
  const tousSalaries = missions.length > 0 && missions.every((m) => m.salarie)
  const gens = [...new Set(missions.map((m) => m.provider_name))].sort((a, b) => a.localeCompare(b, 'fr'))
  const visibles = qui ? missions.filter((m) => m.provider_name === qui) : missions

  const tousCoches = visibles.length > 0 && visibles.every((m) => selection.has(m.id))
  const totalSelection = missions
    .filter((m) => selection.has(m.id))
    .reduce((s, m) => s + m.total_ht, 0)
  const totalVisible = visibles.reduce((s, m) => s + m.total_ht, 0)

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
      {selection.size > 0 && managers.length > 0 && (
        <form
          action={transferer}
          className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-white px-5 py-3"
        >
          {[...selection].map((id) => (
            <input key={id} type="hidden" name="mission_id" value={id} />
          ))}
          <span className="text-sm text-navy/75">
            Confier ces {selection.size} prestation{selection.size > 1 ? 's' : ''} à
          </span>
          <select name="vers" className="field w-56 text-sm" aria-label="Nouveau manager" required defaultValue="">
            <option value="" disabled>
              Choisir…
            </option>
            {managers
              .filter((x) => x.id !== moi)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.full_name}
                </option>
              ))}
          </select>
          <SubmitButton size="sm" variant="secondary" pendingLabel="Transfert…">
            <ArrowRightLeft size={14} />
            Transférer
          </SubmitButton>
          <p className="w-full text-xs text-muted">
            Elles repassent en attente de validation : c’est la personne qui les reçoit qui se
            prononce, en son nom, et elle en est prévenue par mail.
          </p>
        </form>
      )}
      {transfert?.message && (
        <p className="mb-3 rounded-lg bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">{transfert.message}</p>
      )}
      {transfert?.error && (
        <p className="mb-3 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">{transfert.error}</p>
      )}

      {selection.size > 0 && (
        <form
          action={approveMission}
          className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3"
        >
          {[...selection].map((id) => (
            <input key={id} type="hidden" name="mission_id" value={id} />
          ))}
          <span className="text-sm text-emerald-900">
            <strong>{selection.size}</strong> prestation{selection.size > 1 ? 's' : ''} —{' '}
            <strong>{money(totalSelection)} HT</strong>. Chaque prestataire concerné
            recevra un seul email.
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelection(new Set())}
              className="cursor-pointer rounded-lg px-3 py-1.5 text-sm text-navy/70 hover:bg-white"
            >
              Annuler
            </button>
            <SubmitButton size="sm" variant="success" pendingLabel="Validation…">
              <Check size={14} />
              {!dejaVues
                ? 'Valider la sélection'
                : tousSalaries
                  ? 'Bon pour la paie — la sélection'
                  : 'Bon à payer pour la sélection'}
            </SubmitButton>
          </div>
        </form>
      )}

    {gens.length > 1 && (
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setQui('')}
          className={clsx(
            'cursor-pointer rounded-full border px-3 py-1 text-xs font-medium',
            qui === '' ? 'border-navy bg-navy text-cream' : 'border-line bg-white text-navy/70 hover:border-gold/50'
          )}
        >
          Tout le monde ({missions.length})
        </button>
        {gens.map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setQui(g === qui ? '' : g)}
            className={clsx(
              'cursor-pointer rounded-full border px-3 py-1 text-xs font-medium',
              qui === g ? 'border-navy bg-navy text-cream' : 'border-line bg-white text-navy/70 hover:border-gold/50'
            )}
          >
            {g} ({missions.filter((m) => m.provider_name === g).length})
          </button>
        ))}
        {qui && (
          <span className="text-xs text-muted">
            {visibles.length} prestation{visibles.length > 1 ? 's' : ''} · {money(totalVisible)} HT
          </span>
        )}
      </div>
    )}

    {/* Sans cette phrase, la sélection multiple n'existe que pour qui a
        pensé à cocher : rien à l'écran ne dit qu'une case ouvre deux
        actions de masse. */}
    {selection.size === 0 && missions.length > 1 && (
      <p className="mb-2 text-xs text-muted">
        Cochez plusieurs lignes pour les valider, ou les confier d’un coup à un autre manager.
      </p>
    )}

    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col className="w-8" />
            <col className="w-44" />
            <col />
            <col className="w-28" />
            {showManager && <col className="w-32" />}
            <col className="w-24" />
            <col className="w-36" />
          </colgroup>
          <thead className="border-b border-line bg-cream-muted text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={tousCoches}
                  onChange={() =>
                    setSelection(tousCoches ? new Set() : new Set(visibles.map((m) => m.id)))
                  }
                  title="Tout sélectionner"
                  className="h-4 w-4 cursor-pointer accent-emerald-600"
                />
              </th>
              <th className="px-3 py-2.5 font-medium">Prestataire</th>
              <th className="px-3 py-2.5 font-medium">Prestation</th>
              <th className="px-3 py-2.5 font-medium">Période</th>
              {showManager && <th className="px-3 py-2.5 font-medium">Manager</th>}
              <th className="px-3 py-2.5 text-right font-medium">Montant HT</th>
              <th className="px-3 py-2.5 text-right font-medium">Décision</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/60">
            {visibles.map((m) => (
            <Fragment key={m.id}>
              <tr
                className={clsx('align-middle', selection.has(m.id) && 'bg-emerald-50/60')}
              >
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selection.has(m.id)}
                    onChange={() => bascule(m.id)}
                    className="h-4 w-4 cursor-pointer accent-emerald-600"
                  />
                </td>
                <td className="truncate px-3 py-2 font-medium text-navy" title={m.provider_name}>
                  {m.provider_name}
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => basculerDetail(m.id)}
                    title={ouvert.has(m.id) ? 'Replier' : 'Voir le détail'}
                    className="flex w-full cursor-pointer items-center gap-1.5 text-left"
                  >
                    <ChevronRight
                      size={14}
                      className={clsx(
                        'shrink-0 text-navy/40 transition-transform',
                        ouvert.has(m.id) && 'rotate-90'
                      )}
                    />
                    <span className="truncate text-navy" title={m.detail}>
                      {m.detail}
                    </span>
                    {m.regularisation && (
                      <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-px text-[10px] font-semibold text-amber-800 ring-1 ring-amber-200">
                        rattrapage
                      </span>
                    )}
                    {m.manager_approved_at && (
                      <span className="shrink-0 text-emerald-600" title={`Validée par ${m.valide_par ?? 'son manager'}`}>
                        ✓
                      </span>
                    )}
                  </button>
                </td>
                <td
                  className="truncate px-3 py-2 text-xs text-navy/70"
                  title={formatPeriod(m.start_date, m.end_date)}
                >
                  {periodeCourte(m.start_date, m.end_date)}
                </td>
                {showManager && (
                  <td className="truncate px-3 py-2 text-xs text-navy/70" title={m.manager_name}>
                    {m.manager_name}
                  </td>
                )}
                <td className="whitespace-nowrap px-3 py-2 text-right font-semibold text-navy">
                  {money(m.total_ht)}
                </td>
                <td className="px-3 py-2 text-right">
                  <form action={approveMission}>
                    <input type="hidden" name="mission_id" value={m.id} />
                    <button
                      type="submit"
                      className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700"
                    >
                      <Check size={13} />
                      {!m.manager_approved_at
                        ? 'Valider'
                        : m.salarie
                          ? 'Bon pour la paie'
                          : 'Bon à payer'}
                    </button>
                  </form>
                </td>
              </tr>
              {(ouvert.has(m.id) || editing === m.id || rejecting === m.id || confier === m.id) && (
                <tr key={`${m.id}-detail`} className="bg-cream-muted/40">
                  <td />
                  <td colSpan={showManager ? 6 : 5} className="px-3 pb-3 pt-0">
                    <div className="max-w-3xl">
                  {/* La preuve Qualiopi se lit ici : sans le créneau et le
                      groupe sous les yeux, un manager valide un total d'heures
                      sans savoir ce qu'il valide. */}
                  {m.start_time && (
                    <p className="mt-0.5 text-xs font-medium text-navy/75">
                      {heure(m.start_time)}–{heure(m.end_time)}
                      {m.groupe ? ` · ${m.groupe}` : ''}
                      {m.subject ? ` · ${m.subject}` : ''}
                      {m.modality ? ` · ${MODALITE_LABEL[m.modality] ?? m.modality}` : ''}
                      {m.location ? ` · ${m.location}` : ''}
                    </p>
                  )}
                  <p className="mt-0.5 text-xs text-muted">
                    {m.formation ? `${m.formation} · ` : ''}
                    {m.category_name} · {PRICING_LABEL[m.pricing_type]} ·{' '}
                    {Number(m.quantity)} {PRICING_UNIT[m.pricing_type]} ×{' '}
                    {money(m.unit_amount_ht)}
                    {m.abatement_rate > 0 && (
                      <>
                        {' = '}
                        <span className="line-through">{money(m.quantity * m.unit_amount_ht)}</span>
                        {` − ${m.abatement_rate} % (contrat)`}
                      </>
                    )}
                    {/* Le levier au cas par cas : un remboursement de
                        transport n'est pas une rémunération, et lui retirer
                        des charges n'aurait aucun sens. */}
                    {m.abattable && (
                      <form action={basculerAbattement} className="mt-1 inline-block">
                        <input type="hidden" name="mission_id" value={m.id} />
                        <button
                          type="submit"
                          className="cursor-pointer text-[11px] font-medium text-gold-dark underline-offset-2 hover:underline"
                        >
                          {m.abatement_rate > 0 ? 'Lever l’abattement sur cette ligne' : 'Rétablir l’abattement'}
                        </button>
                      </form>
                    )}
                  </p>

                  {m.manager_approved_at && (
                    <p className="mt-1 text-xs font-medium text-emerald-700">
                      ✓ Validée par {m.valide_par ?? 'son manager'} le{' '}
                      {formatDateLong(m.manager_approved_at.slice(0, 10))}
                    </p>
                  )}

                  {m.contract && <ContractBreakdown c={m.contract} />}

                  {/* Les gestes rares vivent ici, en toutes lettres. Sur la
                      ligne, trois icônes muettes encombraient la décision
                      sans qu'on sache laquelle faisait quoi. */}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {managers.length > 0 && (
                      <BoutonDetail
                        actif={confier === m.id}
                        onClick={() => ouvrir(m.id, 'confier')}
                        icone={<ArrowRightLeft size={13} />}
                      >
                        Changer de manager
                      </BoutonDetail>
                    )}
                    <BoutonDetail
                      actif={editing === m.id}
                      onClick={() => ouvrir(m.id, 'corriger')}
                      icone={<Pencil size={13} />}
                    >
                      Corriger
                    </BoutonDetail>
                    <BoutonDetail
                      actif={rejecting === m.id}
                      onClick={() => ouvrir(m.id, 'refuser')}
                      icone={<X size={13} />}
                    >
                      Refuser
                    </BoutonDetail>
                  </div>

                  {correction?.id === m.id && correction.error && (
                    <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{correction.error}</p>
                  )}
                  {correction?.id === m.id && correction.message && (
                    <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                      {correction.message}
                    </p>
                  )}

                  {editing === m.id && (
                    <form
                      action={async (fd) => {
                        const r = await corrigerMission(fd)
                        setCorrection({ id: m.id, ...r })
                        // Une correction refusée laisse le formulaire ouvert :
                        // le refermer effacerait la saisie sans rien expliquer.
                        if (!r.error) setEditing(null)
                      }}
                      className="mt-3 grid gap-2 rounded-lg border border-line bg-cream-muted p-3 sm:grid-cols-[1fr_90px_110px]"
                    >
                      <input type="hidden" name="mission_id" value={m.id} />
                      <input name="detail" defaultValue={m.detail} className="field text-xs" aria-label="Désignation" required minLength={3} />
                      <input name="quantity" type="number" step="0.25" min="0.25" defaultValue={m.quantity} className="field text-xs" aria-label="Quantité" required />
                      <input name="unit_amount_ht" type="number" step="0.01" min="0" defaultValue={m.unit_amount_ht} className="field text-xs" aria-label="Prix unitaire HT" required />
                      <div className="flex gap-2 sm:col-span-3">
                        <SubmitButton size="sm" pendingLabel="…">Enregistrer la correction</SubmitButton>
                        <button type="button" onClick={() => setEditing(null)} className="cursor-pointer rounded-lg px-3 py-1.5 text-xs text-navy/70 hover:bg-cream-deep">
                          Annuler
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Le transfert au cas par cas : « cette ligne n'est pas
                      pour moi ». Il vit sur la ligne parce que c'est là qu'on
                      s'en aperçoit — la sélection multiple, elle, ne se montre
                      qu'une fois qu'on a coché, donc ne se devine pas. */}
                  {confier === m.id && managers.length > 0 && (
                    <form action={transferer} className="mt-3 flex flex-wrap items-center gap-2">
                      <input type="hidden" name="mission_id" value={m.id} />
                      <span className="text-xs text-navy/75">Confier cette prestation à</span>
                      <select name="vers" className="field w-52 text-xs" required defaultValue="" aria-label="Nouveau manager">
                        <option value="" disabled>
                          Choisir…
                        </option>
                        {managers
                          .filter((x) => x.id !== moi && x.id !== m.manager_id)
                          .map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.full_name}
                            </option>
                          ))}
                      </select>
                      <SubmitButton size="sm" variant="secondary" pendingLabel="…">
                        Transférer
                      </SubmitButton>
                      <button
                        type="button"
                        onClick={() => setConfier(null)}
                        className="cursor-pointer rounded-lg px-2 py-1 text-xs text-navy/70 hover:bg-cream-deep"
                      >
                        Annuler
                      </button>
                    </form>
                  )}

                  {rejecting === m.id && (
                    <form action={rejectMission} className="mt-3 flex flex-col gap-2">
                      <input type="hidden" name="mission_id" value={m.id} />
                      <textarea
                        name="rejection_reason"
                        rows={2}
                        required
                        minLength={3}
                        autoFocus
                        placeholder="Motif du refus (visible par le prestataire)…"
                        className="field text-xs"
                      />
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          className="cursor-pointer rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
                        >
                          Confirmer le refus
                        </button>
                        <button
                          type="button"
                          onClick={() => setRejecting(null)}
                          className="cursor-pointer rounded-lg px-3 py-1.5 text-xs text-navy/70 hover:bg-cream-deep"
                        >
                          Annuler
                        </button>
                      </div>
                    </form>
                  )}
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
    </>
  )
}

/**
 * Un geste secondaire, dans le détail d’une ligne.
 *
 * Il s’allume quand son formulaire est ouvert : sans ça, rien ne dit
 * lequel des trois a répondu au clic.
 */
function BoutonDetail({
  actif,
  onClick,
  icone,
  children,
}: {
  actif: boolean
  onClick: () => void
  icone: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors',
        actif
          ? 'border-gold/60 bg-gold/10 text-navy'
          : 'border-line bg-white text-navy/70 hover:border-gold/50 hover:text-navy'
      )}
    >
      {icone}
      {children}
    </button>
  )
}

/**
 * La période, resserrée pour la ligne.
 *
 * « du 13/09/2026 au 25/09/2026 » débordait sur la colonne voisine ; le
 * libellé entier reste au survol.
 */
function periodeCourte(start: string | null, end: string | null): string {
  if (!start) return '—'
  if (!end || end === start) return formatDate(start)
  return `${formatDate(start).slice(0, 5)} → ${formatDate(end).slice(0, 5)}`
}

