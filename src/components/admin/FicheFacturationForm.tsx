'use client'

import { useActionState } from 'react'
import { Input } from '@/components/ui/Field'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { corrigerFicheFacturation } from '@/app/(app)/admin/actions'
import type { Provider } from '@/lib/types'

interface Resultat {
  success?: string
  error?: string
  fieldErrors?: Record<string, string>
}

/**
 * Corriger la fiche de quelqu'un à sa place.
 *
 * C'est la personne qui remplit la sienne, mais il faut pouvoir la dépanner :
 * une adresse mal saisie, un SIRET reçu par message, une auto-entreprise
 * encore en création. Les coordonnées bancaires ne sont modifiables que par
 * l'administration — changer un IBAN, c'est détourner un virement.
 */
export function FicheFacturationForm({ provider, admin }: { provider: Provider; admin: boolean }) {
  const [state, action] = useActionState<Resultat, FormData>(corrigerFicheFacturation, {})
  const err = (c: string) => state.fieldErrors?.[c]

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="provider_id" value={provider.id} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Input id="legal_name" name="legal_name" label="Nom ou raison sociale" defaultValue={provider.legal_name} error={err('legal_name')} required />
        <Input id="legal_form" name="legal_form" label="Forme juridique" defaultValue={provider.legal_form ?? ''} placeholder="Micro-entreprise" error={err('legal_form')} />
        <Input
          id="siret"
          name="siret"
          label="SIRET"
          defaultValue={provider.siret ?? ''}
          placeholder="14 chiffres, ou « en cours »"
          hint="Écrivez « en cours » tant que l’auto-entreprise est en création, puis corrigez dès réception."
          error={err('siret')}
        />
        <Input id="vat_number" name="vat_number" label="N° de TVA" defaultValue={provider.vat_number ?? ''} error={err('vat_number')} />
        <Input id="address_line1" name="address_line1" label="Adresse" defaultValue={provider.address_line1 ?? ''} error={err('address_line1')} />
        <Input id="address_line2" name="address_line2" label="Complément d’adresse" defaultValue={provider.address_line2 ?? ''} error={err('address_line2')} />
        <Input id="postal_code" name="postal_code" label="Code postal" defaultValue={provider.postal_code ?? ''} error={err('postal_code')} />
        <Input id="city" name="city" label="Ville" defaultValue={provider.city ?? ''} error={err('city')} />
        <Input id="phone" name="phone" label="Téléphone" defaultValue={provider.phone ?? ''} error={err('phone')} />
      </div>

      {admin ? (
        <div className="grid gap-4 rounded-lg border border-line bg-cream-muted p-4 sm:grid-cols-2">
          <p className="text-xs text-muted sm:col-span-2">
            Coordonnées bancaires — réservées à l’administration.
          </p>
          <Input id="iban" name="iban" label="IBAN" defaultValue={provider.iban ?? ''} error={err('iban')} />
          <Input id="bic" name="bic" label="BIC" defaultValue={provider.bic ?? ''} error={err('bic')} />
        </div>
      ) : (
        <p className="rounded-lg border border-line bg-cream-muted px-3 py-2.5 text-xs text-muted">
          L’IBAN ne se modifie que depuis l’administration, ou par la personne elle-même dans ses informations.
        </p>
      )}

      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state.success && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{state.success}</p>}

      <div className="flex justify-end">
        <SubmitButton pendingLabel="Enregistrement…">Enregistrer</SubmitButton>
      </div>
    </form>
  )
}
