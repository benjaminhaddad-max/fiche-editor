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
  statementId,
  defaultMode,
}: {
  action: (prev: InvoiceActionResult, formData: FormData) => Promise<InvoiceActionResult>
  missions: BillableMission[]
  vatRate: number
  statementId?: string
  defaultMode: 'generated' | 'uploaded'
}) {
  const [state, formAction] = useActionState<InvoiceActionResult, FormData>(action, {})
  const [mode, setMode] = useState(defaultMode)
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
      {statementId && <input type="hidden" name="statement_id" value={statementId} />}
      <input type="hidden" name="mode" value={mode} />
      <div className="grid gap-3 sm:grid-cols-2">
        {(
          [
            ['generated', 'La plateforme génère ma facture', 'Numérotée, avec vos coordonnées : elle part tout de suite à Diploma Santé.'],
            ['uploaded', 'Je dépose ma propre facture', 'Vous déposez votre PDF à l’étape suivante ; son montant est vérifié avant l’envoi.'],
          ] as const
        ).map(([valeur, titre, desc]) => (
          <button
            key={valeur}
            type="button"
            onClick={() => setMode(valeur)}
            className={`cursor-pointer rounded-lg border p-4 text-left transition-colors ${
              mode === valeur ? 'border-gold bg-gold/10' : 'border-line bg-white hover:bg-cream-muted'
            }`}
          >
            <span className="block text-sm font-medium text-navy">{titre}</span>
            <span className="mt-0.5 block text-xs text-navy/70">{desc}</span>
          </button>
        ))}
      </div>
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-line bg-cream-muted px-4 py-3">
          <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-navy/80">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() =>
                setSelected(allSelected ? new Set() : new Set(missions.map((m) => m.id)))
              }
              className="h-4 w-4 accent-navy"
            />
            Tout sélectionner
          </label>
          <span className="text-sm text-muted">
            {selected.size} / {missions.length} prestation
            {missions.length > 1 ? 's' : ''}
          </span>
        </div>

        <ul className="divide-y divide-line/60">
          {missions.map((m) => (
            <li key={m.id}>
              <label className="flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-cream-muted">
                <input
                  type="checkbox"
                  name="mission_ids"
                  value={m.id}
                  checked={selected.has(m.id)}
                  onChange={() => toggle(m.id)}
                  className="mt-0.5 h-4 w-4 accent-navy"
                />
                <span className="flex-1">
                  <span className="block text-sm font-medium text-navy">
                    {m.detail}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {m.category_name} · {formatPeriod(m.start_date, m.end_date)}
                  </span>
                </span>
                <span className="whitespace-nowrap text-sm font-semibold text-navy">
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
            <dt className="text-navy/70">Total HT</dt>
            <dd className="font-medium text-navy">{money(subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-navy/70">
              TVA {vatRate > 0 ? `(${vatRate} %)` : ''}
            </dt>
            <dd className="font-medium text-navy">
              {vatRate > 0 ? money(vat) : 'Non applicable'}
            </dd>
          </div>
          <div className="mt-1 flex justify-between border-t border-line pt-2">
            <dt className="font-semibold text-navy">Net à payer</dt>
            <dd className="text-base font-bold text-navy">
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
          {mode === 'uploaded' ? 'Continuer vers le dépôt' : 'Générer et transmettre'}
        </SubmitButton>
      </div>
    </form>
  )
}
