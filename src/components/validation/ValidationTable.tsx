'use client'

import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { approveMission, rejectMission } from '@/app/(app)/validation/actions'
import { Card } from '@/components/ui/Page'
import { formatPeriod, money } from '@/lib/format'
import { PRICING_LABEL, PRICING_UNIT } from '@/lib/labels'
import type { PricingType } from '@/lib/types'

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
}

export function ValidationTable({
  missions,
  showManager,
}: {
  missions: ReviewMission[]
  showManager?: boolean
}) {
  const [rejecting, setRejecting] = useState<string | null>(null)

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Prestataire</th>
              <th className="px-4 py-3 font-medium">Prestation</th>
              <th className="px-4 py-3 font-medium">Période</th>
              {showManager && <th className="px-4 py-3 font-medium">Donneur d’ordre</th>}
              <th className="px-4 py-3 text-right font-medium">Montant HT</th>
              <th className="px-4 py-3 text-right font-medium">Décision</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {missions.map((m) => (
              <tr key={m.id} className="align-top">
                <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">
                  {m.provider_name}
                </td>
                <td className="px-4 py-3">
                  <p className="text-slate-900">{m.detail}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {m.category_name} · {PRICING_LABEL[m.pricing_type]} ·{' '}
                    {Number(m.quantity)} {PRICING_UNIT[m.pricing_type]} ×{' '}
                    {money(m.unit_amount_ht)}
                  </p>

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
                          className="cursor-pointer rounded-lg px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100"
                        >
                          Annuler
                        </button>
                      </div>
                    </form>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                  {formatPeriod(m.start_date, m.end_date)}
                </td>
                {showManager && (
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    {m.manager_name}
                  </td>
                )}
                <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-slate-900">
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
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
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
  )
}
