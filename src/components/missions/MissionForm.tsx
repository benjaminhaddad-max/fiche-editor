'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { Input, Select, Textarea } from '@/components/ui/Field'
import { Card } from '@/components/ui/Page'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { money, round2 } from '@/lib/format'
import { PRICING_LABEL, PRICING_UNIT } from '@/lib/labels'
import type { ActionResult } from '@/app/(app)/missions/actions'
import type { Category, Mission, PricingType } from '@/lib/types'

interface Props {
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>
  categories: Pick<Category, 'id' | 'name' | 'provider_label'>[]
  managers: { id: string; full_name: string }[]
  mission?: Mission
  defaultManagerId?: string | null
}

const PRICING_TYPES: PricingType[] = ['forfait_mission', 'forfait_horaire']

export function MissionForm({
  action,
  categories,
  managers,
  mission,
  defaultManagerId,
}: Props) {
  const [state, formAction] = useActionState<ActionResult, FormData>(action, {})

  const [pricingType, setPricingType] = useState<PricingType>(
    mission?.pricing_type ?? 'forfait_mission'
  )
  const [quantity, setQuantity] = useState(String(mission?.quantity ?? '1'))
  const [unitAmount, setUnitAmount] = useState(String(mission?.unit_amount_ht ?? ''))

  const total = round2((Number(quantity) || 0) * (Number(unitAmount) || 0))
  const errors = state.fieldErrors ?? {}

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {mission && <input type="hidden" name="mission_id" value={mission.id} />}

      <Card className="p-6">
        <h2 className="mb-5 text-sm font-semibold text-slate-900">
          Détail de la prestation
        </h2>

        <div className="grid gap-5 sm:grid-cols-2">
          <Select
            id="manager_id"
            name="manager_id"
            label="Manager"
            defaultValue={mission?.manager_id ?? defaultManagerId ?? ''}
            error={errors.manager_id}
            hint="La personne de Diploma Santé qui vous a confié la mission."
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
          </Select>

          <Select
            id="category_id"
            name="category_id"
            label="Catégorie de mission"
            defaultValue={mission?.category_id ?? ''}
            error={errors.category_id}
            hint="Si rien ne correspond, choisissez « Autres » et précisez dans le détail."
            required
          >
            <option value="" disabled>
              Sélectionner…
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.provider_label || c.name}
              </option>
            ))}
          </Select>

          <Input
            id="start_date"
            name="start_date"
            type="date"
            label="Date de début"
            defaultValue={mission?.start_date ?? ''}
            error={errors.start_date}
            required
          />

          <Input
            id="end_date"
            name="end_date"
            type="date"
            label="Date de fin"
            defaultValue={mission?.end_date ?? ''}
            error={errors.end_date}
            hint="Facultatif si la prestation tient sur une journée."
          />

          <div className="sm:col-span-2">
            <Textarea
              id="detail"
              name="detail"
              label="Détail"
              rows={3}
              maxLength={500}
              defaultValue={mission?.detail ?? ''}
              error={errors.detail}
              placeholder="Ex : 4 séances de TD Anatomie — groupe PASS B, campus Lyon."
              hint="Ce texte apparaîtra tel quel sur votre facture."
              required
            />
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="mb-5 text-sm font-semibold text-slate-900">Tarification</h2>

        <div className="mb-5 flex flex-wrap gap-3">
          {PRICING_TYPES.map((type) => (
            <label
              key={type}
              className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-4 py-2.5 text-sm transition-colors ${
                pricingType === type
                  ? 'border-brand-600 bg-brand-50 font-medium text-brand-700'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <input
                type="radio"
                name="pricing_type"
                value={type}
                checked={pricingType === type}
                onChange={() => setPricingType(type)}
                className="accent-brand-600"
              />
              {PRICING_LABEL[type]}
            </label>
          ))}
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          <Input
            id="quantity"
            name="quantity"
            type="number"
            step="0.25"
            min="0.25"
            label={`Quantité (${PRICING_UNIT[pricingType]})`}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            error={errors.quantity}
            required
          />

          <Input
            id="unit_amount_ht"
            name="unit_amount_ht"
            type="number"
            step="0.01"
            min="0"
            label={
              pricingType === 'forfait_horaire'
                ? 'Tarif horaire HT (€)'
                : 'Montant HT par mission (€)'
            }
            value={unitAmount}
            onChange={(e) => setUnitAmount(e.target.value)}
            error={errors.unit_amount_ht}
            required
          />

          <div>
            <span className="field-label">Montant total HT</span>
            <div className="flex h-[38px] items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-900">
              {money(total)}
            </div>
            <p className="field-hint">Calculé automatiquement.</p>
          </div>
        </div>
      </Card>

      {state.error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Link
          href="/missions"
          className="mr-auto rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
        >
          Annuler
        </Link>
        <SubmitButton
          name="intent"
          value="save"
          variant="secondary"
          pendingLabel="Enregistrement…"
        >
          Enregistrer en brouillon
        </SubmitButton>
        <SubmitButton name="intent" value="submit" pendingLabel="Envoi…">
          Envoyer en validation
        </SubmitButton>
      </div>
    </form>
  )
}
