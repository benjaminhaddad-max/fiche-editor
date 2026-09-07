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

  // Champs contrôlés, volontairement. React 19 réinitialise un formulaire
  // non contrôlé dès qu'une action serveur se termine : sur une erreur de
  // validation, l'utilisateur perdait tout ce qu'il venait de saisir.
  const [champs, setChamps] = useState({
    legal_name: provider.legal_name ?? '',
    legal_form: provider.legal_form ?? '',
    siret: provider.siret ?? '',
    address_line1: provider.address_line1 ?? '',
    address_line2: provider.address_line2 ?? '',
    postal_code: provider.postal_code ?? '',
    city: provider.city ?? '',
    country: provider.country ?? 'France',
    phone: provider.phone ?? '',
    vat_number: provider.vat_number ?? '',
    iban: provider.iban ?? '',
    bic: provider.bic ?? '',
  })
  const maj = (nom: keyof typeof champs) => (ev: { target: { value: string } }) =>
    setChamps((c) => ({ ...c, [nom]: ev.target.value }))

  const [vatRegime, setVatRegime] = useState<VatRegime>(provider.vat_regime)
  const [invoiceMode, setInvoiceMode] = useState<InvoiceSource>(provider.invoice_mode)
  const e = state.fieldErrors ?? {}
  const nbErreurs = Object.keys(e).length

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <Card className="p-6">
        <h2 className="mb-1 text-sm font-semibold text-navy">Identité</h2>
        <p className="mb-5 text-xs text-muted">
          Ces informations apparaissent en tant qu’émetteur sur vos factures.
        </p>

        <div className="grid gap-5 sm:grid-cols-2">
          <Input
            id="legal_name"
            name="legal_name"
            label="Raison sociale / Nom"
            value={champs.legal_name}
            onChange={maj('legal_name')}
            error={e.legal_name}
            required
          />
          <Input
            id="legal_form"
            name="legal_form"
            label="Forme juridique"
            placeholder="Auto-entrepreneur, SASU…"
            value={champs.legal_form}
            onChange={maj('legal_form')}
            error={e.legal_form}
          />
          <Input
            id="siret"
            name="siret"
            label="SIRET"
            placeholder="12345678900019"
            value={champs.siret}
            onChange={maj('siret')}
            error={e.siret}
            hint="Auto-entreprise encore en création ? Écrivez « en cours », vous le compléterez plus tard."
          />
          <Input id="email" label="Email" value={email} disabled readOnly />
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="mb-5 text-sm font-semibold text-navy">Adresse</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Input
              id="address_line1"
              name="address_line1"
              label="Adresse"
              value={champs.address_line1}
            onChange={maj('address_line1')}
              error={e.address_line1}
              required
            />
          </div>
          <div className="sm:col-span-2">
            <Input
              id="address_line2"
              name="address_line2"
              label="Complément d’adresse"
              value={champs.address_line2}
            onChange={maj('address_line2')}
              error={e.address_line2}
            />
          </div>
          <Input
            id="postal_code"
            name="postal_code"
            label="Code postal"
            value={champs.postal_code}
            onChange={maj('postal_code')}
            error={e.postal_code}
            required
          />
          <Input
            id="city"
            name="city"
            label="Ville"
            value={champs.city}
            onChange={maj('city')}
            error={e.city}
            required
          />
          <Input
            id="country"
            name="country"
            label="Pays"
            value={champs.country}
            onChange={maj('country')}
            error={e.country}
            required
          />
          <Input
            id="phone"
            name="phone"
            label="Téléphone"
            type="tel"
            value={champs.phone}
            onChange={maj('phone')}
            error={e.phone}
          />
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="mb-5 text-sm font-semibold text-navy">TVA et règlement</h2>
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
          {vatRegime === 'normal' ? (
            <Input
              id="vat_number"
              name="vat_number"
              label="Numéro de TVA intracommunautaire"
              placeholder="FR00123456789"
              value={champs.vat_number}
            onChange={maj('vat_number')}
              error={e.vat_number}
              required
            />
          ) : (
            <div className="flex items-end pb-1">
              <p className="text-xs text-muted">
                En franchise en base, vous n’avez pas de numéro de TVA
                intracommunautaire : il n’y a rien à renseigner ici.
              </p>
            </div>
          )}
          <Input
            id="iban"
            name="iban"
            label="IBAN"
            placeholder="FR76 ..."
            value={champs.iban}
            onChange={maj('iban')}
            error={e.iban}
          />
          <Input
            id="bic"
            name="bic"
            label="BIC"
            value={champs.bic}
            onChange={maj('bic')}
            error={e.bic}
          />
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="mb-1 text-sm font-semibold text-navy">Vos factures</h2>
        <p className="mb-5 text-xs text-muted">
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
                  ? 'border-gold bg-gold/10'
                  : 'border-line hover:bg-cream-muted'
              }`}
            >
              <input
                type="radio"
                name="invoice_mode"
                value={opt.value}
                checked={invoiceMode === opt.value}
                onChange={() => setInvoiceMode(opt.value)}
                className="mt-0.5 accent-navy"
              />
              <span>
                <span className="block text-sm font-medium text-navy">{opt.title}</span>
                <span className="mt-0.5 block text-xs text-navy/70">{opt.desc}</span>
              </span>
            </label>
          ))}
        </div>
      </Card>

      {nbErreurs > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p className="font-semibold">
            {nbErreurs === 1
              ? 'Un champ doit être corrigé :'
              : `${nbErreurs} champs doivent être corrigés :`}
          </p>
          <ul className="mt-1 list-inside list-disc">
            {Object.values(e).map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs">Votre saisie est conservée, corrigez et réenregistrez.</p>
        </div>
      )}

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
