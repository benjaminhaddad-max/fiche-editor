'use client'

import { useActionState } from 'react'
import { Input, Select, Textarea } from '@/components/ui/Field'
import { Card } from '@/components/ui/Page'
import { SubmitButton } from '@/components/ui/SubmitButton'
import type { AdminResult } from '@/app/(app)/admin/actions'
import type { Provider } from '@/lib/types'

export function ProviderAdminForm({
  action,
  provider,
  managers,
}: {
  action: (prev: AdminResult, formData: FormData) => Promise<AdminResult>
  provider: Provider
  managers: { id: string; full_name: string }[]
}) {
  const [state, formAction] = useActionState<AdminResult, FormData>(action, {})
  const e = state.fieldErrors ?? {}

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="provider_id" value={provider.id} />

      <Card className="p-6">
        <h2 className="mb-1 text-sm font-semibold text-slate-900">
          Paramètres de facturation
        </h2>
        <p className="mb-5 text-xs text-slate-500">
          Ces champs sont sous votre contrôle. Identité, adresse et IBAN sont renseignés
          par le prestataire lui-même.
        </p>

        <div className="grid gap-5 sm:grid-cols-2">
          <Input
            id="invoice_prefix"
            name="invoice_prefix"
            label="Préfixe de numérotation"
            defaultValue={provider.invoice_prefix}
            hint={`Prochaine facture : ${provider.invoice_prefix}-${new Date().getFullYear()}-${String(provider.next_invoice_seq).padStart(4, '0')}`}
            error={e.invoice_prefix}
            required
          />
          <Input
            id="payment_terms_days"
            name="payment_terms_days"
            type="number"
            min={0}
            max={120}
            label="Délai de paiement (jours)"
            defaultValue={provider.payment_terms_days}
            error={e.payment_terms_days}
            required
          />
          <Input
            id="pennylane_supplier_id"
            name="pennylane_supplier_id"
            label="ID fournisseur Pennylane"
            inputMode="numeric"
            defaultValue={provider.pennylane_supplier_id ?? ''}
            hint="Indispensable pour la synchronisation : c’est lui qui garantit le bon rapprochement."
            error={e.pennylane_supplier_id}
          />
          <Select
            id="default_manager_id"
            name="default_manager_id"
            label="Donneur d’ordre par défaut"
            defaultValue={provider.default_manager_id ?? ''}
            hint="Pré-sélectionné quand le prestataire déclare une mission."
          >
            <option value="">Aucun</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name}
              </option>
            ))}
          </Select>
          <div className="sm:col-span-2">
            <Textarea
              id="notes"
              name="notes"
              label="Notes internes"
              rows={3}
              defaultValue={provider.notes ?? ''}
              hint="Visible uniquement par les administrateurs."
            />
          </div>
        </div>
      </Card>

      {state.error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</p>
      )}
      {state.success && (
        <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {state.success}
        </p>
      )}

      <div className="flex justify-end">
        <SubmitButton pendingLabel="Enregistrement…">Enregistrer</SubmitButton>
      </div>
    </form>
  )
}
