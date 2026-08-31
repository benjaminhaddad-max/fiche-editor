'use client'

import { useActionState, useState } from 'react'
import { Input, Select } from '@/components/ui/Field'
import { Card } from '@/components/ui/Page'
import { SubmitButton } from '@/components/ui/SubmitButton'
import type { ProfileResult } from '@/app/(app)/profil/actions'
import type { InvoiceSource, Provider, VatRegime } from '@/lib/types'

export function ProfileForm({
  action,
  provider,
  email,
}: {
  action: (prev: ProfileResult, formData: FormData) => Promise<ProfileResult>
  provider: Provider
  email: string
}) {
  const [state, formAction] = useActionState<ProfileResult, FormData>(action, {})
  const [vatRegime, setVatRegime] = useState<VatRegime>(provider.vat_regime)
  const [invoiceMode, setInvoiceMode] = useState<InvoiceSource>(provider.invoice_mode)
  const e = state.fieldErrors ?? {}

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <Card className="p-6">
        <h2 className="mb-1 text-sm font-semibold text-slate-900">Identité</h2>
        <p className="mb-5 text-xs text-slate-500">
          Ces informations apparaissent en tant qu’émetteur sur vos factures.
        </p>

        <div className="grid gap-5 sm:grid-cols-2">
          <Input
            id="legal_name"
            name="legal_name"
            label="Raison sociale / Nom"
            defaultValue={provider.legal_name ?? ''}
            error={e.legal_name}
            required
          />
          <Input
            id="legal_form"
            name="legal_form"
            label="Forme juridique"
            placeholder="Auto-entrepreneur, SASU…"
            defaultValue={provider.legal_form ?? ''}
            error={e.legal_form}
          />
          <Input
            id="siret"
            name="siret"
            label="SIRET"
            inputMode="numeric"
            defaultValue={provider.siret ?? ''}
            error={e.siret}
          />
          <Input id="email" label="Email" value={email} disabled readOnly />
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="mb-5 text-sm font-semibold text-slate-900">Adresse</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Input
              id="address_line1"
              name="address_line1"
              label="Adresse"
              defaultValue={provider.address_line1 ?? ''}
              error={e.address_line1}
              required
            />
          </div>
          <div className="sm:col-span-2">
            <Input
              id="address_line2"
              name="address_line2"
              label="Complément d’adresse"
              defaultValue={provider.address_line2 ?? ''}
              error={e.address_line2}
            />
          </div>
          <Input
            id="postal_code"
            name="postal_code"
            label="Code postal"
            defaultValue={provider.postal_code ?? ''}
            error={e.postal_code}
            required
          />
          <Input
            id="city"
            name="city"
            label="Ville"
            defaultValue={provider.city ?? ''}
            error={e.city}
            required
          />
          <Input
            id="country"
            name="country"
            label="Pays"
            defaultValue={provider.country ?? 'France'}
            error={e.country}
            required
          />
          <Input
            id="phone"
            name="phone"
            label="Téléphone"
            type="tel"
            defaultValue={provider.phone ?? ''}
            error={e.phone}
          />
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="mb-5 text-sm font-semibold text-slate-900">TVA et règlement</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <Select
            id="vat_regime"
            name="vat_regime"
            label="Régime de TVA"
            value={vatRegime}
            onChange={(ev) => setVatRegime(ev.target.value as VatRegime)}
            hint={
              vatRegime === 'franchise'
                ? 'Mention « TVA non applicable, art. 293 B du CGI ». Montant HT = montant à payer.'
                : 'TVA à 20 % ajoutée automatiquement sur vos factures.'
            }
          >
            <option value="franchise">Franchise en base (auto-entrepreneur)</option>
            <option value="normal">Assujetti — TVA 20 %</option>
          </Select>
          <Input
            id="vat_number"
            name="vat_number"
            label="Numéro de TVA intracommunautaire"
            placeholder="FR00123456789"
            defaultValue={provider.vat_number ?? ''}
            error={e.vat_number}
            required={vatRegime === 'normal'}
          />
          <Input
            id="iban"
            name="iban"
            label="IBAN"
            placeholder="FR76 ..."
            defaultValue={provider.iban ?? ''}
            error={e.iban}
          />
          <Input
            id="bic"
            name="bic"
            label="BIC"
            defaultValue={provider.bic ?? ''}
            error={e.bic}
          />
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="mb-1 text-sm font-semibold text-slate-900">Vos factures</h2>
        <p className="mb-5 text-xs text-slate-500">
          Dans les deux cas, les montants sont ceux validés par Diploma Santé : ils ne
          sont jamais ressaisis.
        </p>

        <div className="flex flex-col gap-3">
          {(
            [
              {
                value: 'generated' as const,
                title: 'La plateforme génère ma facture',
                desc: 'Numérotation, mentions légales et coordonnées bancaires remplies automatiquement à partir des informations ci-dessus. Vous n’avez qu’à l’envoyer.',
              },
              {
                value: 'uploaded' as const,
                title: 'Je dépose ma propre facture',
                desc: 'Vous éditez votre facture avec votre outil habituel et déposez le PDF. La plateforme vérifie qu’elle correspond aux prestations validées.',
              },
            ]
          ).map((opt) => (
            <label
              key={opt.value}
              className={`flex cursor-pointer gap-3 rounded-lg border p-4 transition-colors ${
                invoiceMode === opt.value
                  ? 'border-brand-600 bg-brand-50'
                  : 'border-slate-300 hover:bg-slate-50'
              }`}
            >
              <input
                type="radio"
                name="invoice_mode"
                value={opt.value}
                checked={invoiceMode === opt.value}
                onChange={() => setInvoiceMode(opt.value)}
                className="mt-0.5 accent-brand-600"
              />
              <span>
                <span className="block text-sm font-medium text-slate-900">{opt.title}</span>
                <span className="mt-0.5 block text-xs text-slate-600">{opt.desc}</span>
              </span>
            </label>
          ))}
        </div>
      </Card>

      {state.error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</p>
      )}
      {state.success && (
        <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Informations enregistrées.
        </p>
      )}

      <div className="flex justify-end">
        <SubmitButton pendingLabel="Enregistrement…">Enregistrer</SubmitButton>
      </div>
    </form>
  )
}
