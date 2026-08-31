'use client'

import { useActionState, useState } from 'react'
import { Card } from '@/components/ui/Page'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { formatPeriod, money, round2 } from '@/lib/format'
import type { InvoiceActionResult } from '@/app/(app)/factures/actions'

export interface BillableMission {
  id: string
  detail: string
  category_name: string
  start_date: string
  end_date: string | null
  total_ht: number
}

export function NewInvoiceForm({
  action,
  missions,
  vatRate,
}: {
  action: (prev: InvoiceActionResult, formData: FormData) => Promise<InvoiceActionResult>
  missions: BillableMission[]
  vatRate: number
}) {
  const [state, formAction] = useActionState<InvoiceActionResult, FormData>(action, {})
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(missions.map((m) => m.id))
  )

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allSelected = selected.size === missions.length
  const subtotal = round2(
    missions.filter((m) => selected.has(m.id)).reduce((s, m) => s + m.total_ht, 0)
  )
  const vat = round2((subtotal * vatRate) / 100)

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
          <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() =>
                setSelected(allSelected ? new Set() : new Set(missions.map((m) => m.id)))
              }
              className="h-4 w-4 accent-brand-600"
            />
            Tout sélectionner
          </label>
          <span className="text-sm text-slate-500">
            {selected.size} / {missions.length} prestation
            {missions.length > 1 ? 's' : ''}
          </span>
        </div>

        <ul className="divide-y divide-slate-100">
          {missions.map((m) => (
            <li key={m.id}>
              <label className="flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-slate-50">
                <input
                  type="checkbox"
                  name="mission_ids"
                  value={m.id}
                  checked={selected.has(m.id)}
                  onChange={() => toggle(m.id)}
                  className="mt-0.5 h-4 w-4 accent-brand-600"
                />
                <span className="flex-1">
                  <span className="block text-sm font-medium text-slate-900">
                    {m.detail}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {m.category_name} · {formatPeriod(m.start_date, m.end_date)}
                  </span>
                </span>
                <span className="whitespace-nowrap text-sm font-semibold text-slate-900">
                  {money(m.total_ht)}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-6">
        <dl className="ml-auto flex max-w-xs flex-col gap-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-600">Total HT</dt>
            <dd className="font-medium text-slate-900">{money(subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-600">
              TVA {vatRate > 0 ? `(${vatRate} %)` : ''}
            </dt>
            <dd className="font-medium text-slate-900">
              {vatRate > 0 ? money(vat) : 'Non applicable'}
            </dd>
          </div>
          <div className="mt-1 flex justify-between border-t border-slate-200 pt-2">
            <dt className="font-semibold text-slate-900">Net à payer</dt>
            <dd className="text-base font-bold text-slate-900">
              {money(subtotal + vat)}
            </dd>
          </div>
        </dl>
      </Card>

      {state.error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</p>
      )}

      <div className="flex justify-end">
        <SubmitButton
          disabled={selected.size === 0}
          pendingLabel="Génération de la facture…"
        >
          Générer la facture
        </SubmitButton>
      </div>
    </form>
  )
}
