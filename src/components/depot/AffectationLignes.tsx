'use client'

import { useActionState, useState } from 'react'
import { Card } from '@/components/ui/Page'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { formatDate, money } from '@/lib/format'
import type { AffectationResult } from '@/app/(app)/factures/deposer/actions'

export interface LigneAffectable {
  id: string
  description: string
  quantity: number | null
  unit_amount_ht: number | null
  total_ht: number
  line_date: string | null
}

export function AffectationLignes({
  action,
  batchId,
  lignes,
  managers,
  categories,
  defaultManagerId,
}: {
  action: (prev: AffectationResult, formData: FormData) => Promise<AffectationResult>
  batchId: string
  lignes: LigneAffectable[]
  managers: { id: string; full_name: string }[]
  categories: { id: string; name: string; provider_label: string | null }[]
  defaultManagerId: string | null
}) {
  const [state, formAction] = useActionState<AffectationResult, FormData>(action, {})
  const [gardees, setGardees] = useState<Set<string>>(() => new Set(lignes.map((l) => l.id)))

  const total = lignes
    .filter((l) => gardees.has(l.id))
    .reduce((s, l) => s + Number(l.total_ht), 0)

  const champ =
    'w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 focus:outline-none'

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="batch_id" value={batchId} />

      <Card className="overflow-hidden">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-3 text-sm text-slate-600">
          {gardees.size} ligne{gardees.size > 1 ? 's' : ''} retenue
          {gardees.size > 1 ? 's' : ''} · <strong className="text-slate-900">{money(total)} HT</strong>
        </div>

        <ul className="divide-y divide-slate-100">
          {lignes.map((l) => {
            const active = gardees.has(l.id)
            return (
              <li key={l.id} className={active ? 'p-5' : 'bg-slate-50/60 p-5 opacity-60'}>
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    name={`garder_${l.id}`}
                    checked={active}
                    onChange={() =>
                      setGardees((prev) => {
                        const next = new Set(prev)
                        if (next.has(l.id)) next.delete(l.id)
                        else next.add(l.id)
                        return next
                      })
                    }
                    className="mt-1 h-4 w-4 cursor-pointer accent-brand-600"
                  />

                  <div className="flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-medium text-slate-900">{l.description}</p>
                      <p className="font-semibold text-slate-900">{money(l.total_ht)}</p>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {l.line_date ? formatDate(l.line_date) : 'date non précisée'}
                      {l.quantity ? ` · ${Number(l.quantity)} × ${money(l.unit_amount_ht ?? 0)}` : ''}
                    </p>

                    {active && (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <label className="block">
                          <span className="mb-1 block text-xs font-medium text-slate-600">
                            Qui vous a confié cette mission ?
                          </span>
                          <select
                            name={`manager_${l.id}`}
                            defaultValue={defaultManagerId ?? ''}
                            className={champ}
                            required
                          >
                            <option value="" disabled>
                              Sélectionner…
                            </option>
                            {managers.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.full_name}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="block">
                          <span className="mb-1 block text-xs font-medium text-slate-600">
                            Type de prestation
                          </span>
                          <select name={`categorie_${l.id}`} defaultValue="" className={champ} required>
                            <option value="" disabled>
                              Sélectionner…
                            </option>
                            {categories.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.provider_label || c.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      </Card>

      {state.error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</p>
      )}

      <div className="flex justify-end">
        <SubmitButton disabled={gardees.size === 0} pendingLabel="Transmission…">
          Transmettre pour validation
        </SubmitButton>
      </div>
    </form>
  )
}
