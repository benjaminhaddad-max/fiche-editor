'use client'

import { useActionState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { signerContrat, type SignatureResult } from '@/app/signature/[token]/actions'
import { Input } from '@/components/ui/Field'
import { SubmitButton } from '@/components/ui/SubmitButton'

export function SignatureForm({
  token,
  nom,
  dejaSigne,
}: {
  token: string
  nom: string
  dejaSigne: boolean
}) {
  const [state, action] = useActionState<SignatureResult, FormData>(signerContrat, {})

  if (dejaSigne || state.signed) {
    return (
      <div className="flex items-start gap-3 rounded-lg bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
        <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold">Votre contrat est signé.</p>
          <p className="mt-1">
            Vous venez de recevoir le PDF signé par email. Il reste consultable dans votre espace, rubrique
            « Mes contrats ».
          </p>
          <a
            href={`/api/signature/${token}/pdf`}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block font-medium underline"
          >
            Ouvrir le contrat signé
          </a>
        </div>
      </div>
    )
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <Input
        id="nom"
        name="nom"
        label="Votre nom et prénom"
        defaultValue={nom}
        hint="Recopiez-le tel qu’il figure sur vos papiers."
        required
        minLength={3}
      />
      <label className="flex cursor-pointer items-start gap-2.5 text-sm text-navy/80">
        <input type="checkbox" name="accepte" className="mt-0.5 h-4 w-4 accent-navy" required />
        <span>
          J’ai lu le contrat en entier et je l’accepte. Je signe électroniquement.
        </span>
      </label>
      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Signature…">Signer mon contrat</SubmitButton>
      </div>
    </form>
  )
}
