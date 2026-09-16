'use client'

import { useActionState, useState } from 'react'
import { creerBon, cloturerBon, type OrderResult } from '@/app/(app)/bons-de-mission/actions'
import { Input, Select, Textarea } from '@/components/ui/Field'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { money, round2 } from '@/lib/format'
import { POLE_LABEL } from '@/lib/labels'
import type { DeclCategory } from '@/components/missions/DeclarationForm'
import type { Pole, PricingType } from '@/lib/types'

export function NewOrderForm({
  providers,
  categories,
  today,
}: {
  providers: { id: string; name: string }[]
  categories: DeclCategory[]
  today: string
}) {
  const [state, action] = useActionState<OrderResult, FormData>(creerBon, {})
  const [type, setType] = useState<PricingType>('forfait_mission')
  const [qte, setQte] = useState('1')
  const [pu, setPu] = useState('')
  const parPole = new Map<Pole, DeclCategory[]>()
  for (const c of categories) parPole.set(c.pole, [...(parPole.get(c.pole) ?? []), c])

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Select id="provider_id" name="provider_id" label="Prestataire" defaultValue="" required>
          <option value="" disabled>
            Choisir…
          </option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select id="category_id" name="category_id" label="Type de mission" defaultValue="" required>
          <option value="" disabled>
            Choisir…
          </option>
          {[...parPole.entries()].map(([pole, cats]) => (
            <optgroup key={pole} label={POLE_LABEL[pole]}>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
        <div className="sm:col-span-2">
          <Input id="title" name="title" label="Mission" placeholder="Ex : Surveillance du concours blanc n°2 — campus Rapée" required />
        </div>
        <Input id="start_date" name="start_date" type="date" label="Début" defaultValue={today} required />
        <Input id="end_date" name="end_date" type="date" label="Fin prévue" hint="Vous recevrez un rappel ce jour-là pour la clôturer." required />
        <Select id="pricing_type" name="pricing_type" label="Tarification" value={type} onChange={(e) => setType(e.target.value as PricingType)}>
          <option value="forfait_mission">Forfait</option>
          <option value="forfait_horaire">À l’heure</option>
        </Select>
        <div className="grid grid-cols-2 gap-3">
          <Input id="quantity" name="quantity" type="number" step="0.25" min="0.25" label={type === 'forfait_horaire' ? 'Heures' : 'Quantité'} value={qte} onChange={(e) => setQte(e.target.value)} required />
          <Input id="unit_amount_ht" name="unit_amount_ht" type="number" step="0.01" min="0" label={type === 'forfait_horaire' ? '€ HT / heure' : '€ HT / unité'} value={pu} onChange={(e) => setPu(e.target.value)} required />
        </div>
        <div className="sm:col-span-2">
          <Textarea id="conditions" name="conditions" label="Conditions" rows={3} placeholder="Horaires, lieu, livrables, ce qui est attendu…" />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-navy">
          Total : <strong>{money(round2((Number(qte) || 0) * (Number(pu) || 0)))} HT</strong>
        </p>
        <SubmitButton pendingLabel="Envoi…">Envoyer le bon de mission</SubmitButton>
      </div>
      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state.success && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{state.success}</p>}
    </form>
  )
}

export function CloseOrderForm({
  orderId,
  title,
  quantity,
  unit,
  unitLabel,
}: {
  orderId: string
  title: string
  quantity: number
  unit: number
  unitLabel: string
}) {
  const [state, action] = useActionState<OrderResult, FormData>(cloturerBon, {})
  const [qte, setQte] = useState(String(quantity))
  const [pu, setPu] = useState(String(unit))
  const total = round2((Number(qte) || 0) * (Number(pu) || 0))
  const prevu = round2(quantity * unit)

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="order_id" value={orderId} />
      <Input id="detail" name="detail" label="Libellé de la prestation" defaultValue={title} required />
      <div className="grid gap-4 sm:grid-cols-3">
        <Input id="quantity" name="quantity" type="number" step="0.25" min="0.25" label={`Réalisé (${unitLabel})`} value={qte} onChange={(e) => setQte(e.target.value)} required />
        <Input id="unit_amount_ht" name="unit_amount_ht" type="number" step="0.01" min="0" label="Prix unitaire HT" value={pu} onChange={(e) => setPu(e.target.value)} required />
        <div>
          <span className="field-label">Total</span>
          <p className="flex h-[38px] items-center font-semibold text-navy">{money(total)}</p>
          {total !== prevu && <p className="field-hint text-amber-700">Prévu : {money(prevu)}</p>}
        </div>
      </div>
      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      <div className="flex justify-end">
        <SubmitButton variant="success" pendingLabel="Clôture…">
          {total === prevu ? 'Mission réalisée comme prévu' : 'Clôturer avec ces ajustements'}
        </SubmitButton>
      </div>
    </form>
  )
}
