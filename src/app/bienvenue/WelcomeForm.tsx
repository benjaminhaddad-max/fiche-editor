'use client'

import { useActionState } from 'react'
import { Input } from '@/components/ui/Field'
import { SubmitButton } from '@/components/ui/SubmitButton'
import type { WelcomeResult } from './actions'

export function WelcomeForm({
  action,
  email,
}: {
  action: (prev: WelcomeResult, formData: FormData) => Promise<WelcomeResult>
  email: string
}) {
  const [state, formAction] = useActionState<WelcomeResult, FormData>(action, {})

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Input id="email" label="Votre email" value={email} disabled readOnly />
      <Input
        id="password"
        name="password"
        type="password"
        autoComplete="new-password"
        label="Choisissez un mot de passe"
        minLength={10}
        hint="10 caractères minimum."
        required
      />
      <Input
        id="confirm"
        name="confirm"
        type="password"
        autoComplete="new-password"
        label="Confirmez"
        minLength={10}
        required
      />
      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}
      <SubmitButton className="mt-1" pendingLabel="Création…">
        Créer mon accès
      </SubmitButton>
    </form>
  )
}
