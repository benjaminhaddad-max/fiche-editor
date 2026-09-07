'use client'

import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { approveMission, rejectMission } from '@/app/(app)/validation/actions'
import { Card } from '@/components/ui/Page'
import { formatPeriod, money } from '@/lib/format'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { PRICING_LABEL, PRICING_UNIT } from '@/lib/labels'
import type { PricingType } from '@/lib/types'
import type { ContractContext } from '@/lib/contract-context'

export interface ReviewMission {
  id: string
  detail: string
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
}: {
  missions: ReviewMission[]
  showManager?: boolean
}) {
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [selection, setSelection] = useState<Set<string>>(new Set())

  const tousCoches = missions.length > 0 && missions.every((m) => selection.has(m.id))
  const totalSelection = missions
    .filter((m) => selection.has(m.id))
    .reduce((s, m) => s + m.total_ht, 0)

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
              Valider la sélection
            </SubmitButton>
          </div>
        </form>
      )}

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
                    setSelection(tousCoches ? new Set() : new Set(missions.map((m) => m.id)))
                  }
                  title="Tout sélectionner"
                  className="h-4 w-4 cursor-pointer accent-emerald-600"
                />
              </th>
              <th className="px-4 py-3 font-medium">Prestataire</th>
              <th className="px-4 py-3 font-medium">Prestation</th>
              <th className="px-4 py-3 font-medium">Période</th>
              {showManager && <th className="px-4 py-3 font-medium">Manager</th>}
              <th className="px-4 py-3 text-right font-medium">Montant HT</th>
              <th className="px-4 py-3 text-right font-medium">Décision</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/60">
            {missions.map((m) => (
              <tr
                key={m.id}
                className={selection.has(m.id) ? 'bg-emerald-50/60 align-top' : 'align-top'}
              >
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selection.has(m.id)}
                    onChange={() => bascule(m.id)}
                    className="h-4 w-4 cursor-pointer accent-emerald-600"
                  />
                </td>
                <td className="whitespace-nowrap px-4 py-3 font-medium text-navy">
                  {m.provider_name}
                </td>
                <td className="px-4 py-3">
                  <p className="text-navy">{m.detail}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {m.category_name} · {PRICING_LABEL[m.pricing_type]} ·{' '}
                    {Number(m.quantity)} {PRICING_UNIT[m.pricing_type]} ×{' '}
                    {money(m.unit_amount_ht)}
                  </p>

                  {m.contract && <ContractBreakdown c={m.contract} />}

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
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-navy/70">
                  {formatPeriod(m.start_date, m.end_date)}
                </td>
                {showManager && (
                  <td className="whitespace-nowrap px-4 py-3 text-navy/70">
                    {m.manager_name}
                  </td>
                )}
                <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-navy">
                  {money(m.total_ht)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <form action={approveMission}>
                      <input type="hidden" name="mission_id" value={m.id} />
                      <button
                        type="submit"
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700"
                      >
                        <Check size={14} />
                        Valider
                      </button>
                    </form>
                    <button
                      type="button"
                      onClick={() => setRejecting(rejecting === m.id ? null : m.id)}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-navy/80 transition-colors hover:bg-cream-muted"
                    >
                      <X size={14} />
                      Refuser
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
    </>
  )
}
