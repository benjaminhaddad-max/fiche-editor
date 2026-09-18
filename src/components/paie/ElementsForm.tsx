'use client'

import { useActionState, useState } from 'react'
import { enregistrerElements, type ElementsResult } from '@/app/(app)/elements-paie/actions'
import { Input, Select, Textarea } from '@/components/ui/Field'
import { SubmitButton } from '@/components/ui/SubmitButton'

export interface ElementsExistants {
  overtime_hours: number
  paid_leave_days: number
  unpaid_leave_days: number
  leave_detail: string | null
  transport: boolean
  transport_amount: number | null
  mutuelle: string
  comment: string | null
  submitted_at: string | null
  transport_document: string | null
}

export function ElementsForm({ period, existant }: { period: string; existant: ElementsExistants | null }) {
  const [state, action] = useActionState<ElementsResult, FormData>(enregistrerElements, {})
  const [transport, setTransport] = useState(existant?.transport ? 'oui' : 'non')

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="period" value={period} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Input
          id="overtime_hours"
          name="overtime_hours"
          type="number"
          step="0.5"
          min="0"
          label="Heures supplémentaires"
          defaultValue={existant?.overtime_hours ?? 0}
          hint="Au-delà de votre contrat. 0 si aucune."
          required
        />
        <Input
          id="paid_leave_days"
          name="paid_leave_days"
          type="number"
          step="0.5"
          min="0"
          label="Congés payés (jours)"
          defaultValue={existant?.paid_leave_days ?? 0}
          required
        />
        <Input
          id="unpaid_leave_days"
          name="unpaid_leave_days"
          type="number"
          step="0.5"
          min="0"
          label="Congés sans solde (jours)"
          defaultValue={existant?.unpaid_leave_days ?? 0}
          required
        />
        <div className="sm:col-span-3">
          <Input
            id="leave_detail"
            name="leave_detail"
            label="Dates des congés (facultatif)"
            defaultValue={existant?.leave_detail ?? ''}
            placeholder="Ex : du 12 au 16, et le 25"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Select
          id="transport"
          name="transport"
          label="Abonnement de transport"
          value={transport}
          onChange={(e) => setTransport(e.target.value)}
        >
          <option value="non">Non</option>
          <option value="oui">Oui (Navigo ou équivalent)</option>
        </Select>
        {transport === 'oui' && (
          <>
            <Input
              id="transport_amount"
              name="transport_amount"
              type="number"
              step="0.01"
              min="0"
              label="Montant mensuel"
              defaultValue={existant?.transport_amount ?? ''}
            />
            <div>
              <span className="field-label">Justificatif</span>
              <input
                type="file"
                name="justificatif"
                accept="application/pdf,image/*"
                className="block text-sm text-navy/70 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-cream-deep file:px-3 file:py-2 file:text-sm file:font-medium file:text-navy/80"
              />
              <p className="field-hint">
                {existant?.transport_document
                  ? 'Un justificatif est déjà déposé ; déposez-en un nouveau pour le remplacer.'
                  : 'PDF ou photo, 6 Mo au plus.'}
              </p>
            </div>
          </>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          id="mutuelle"
          name="mutuelle"
          label="Mutuelle d’entreprise"
          defaultValue={existant && existant.mutuelle !== 'inconnu' ? existant.mutuelle : ''}
          required
        >
          <option value="" disabled>
            Choisir…
          </option>
          <option value="adherent">J’y adhère</option>
          <option value="refus">Je la refuse</option>
        </Select>
        <Textarea
          id="comment"
          name="comment"
          label="À signaler (facultatif)"
          rows={2}
          defaultValue={existant?.comment ?? ''}
          placeholder="Arrêt maladie, changement d’adresse, prime convenue…"
        />
      </div>

      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state.success && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{state.success}</p>}

      <div className="flex justify-end">
        <SubmitButton pendingLabel="Enregistrement…">
          {existant?.submitted_at ? 'Mettre à jour' : 'Envoyer mes éléments'}
        </SubmitButton>
      </div>
    </form>
  )
}
