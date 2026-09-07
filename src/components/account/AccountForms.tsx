'use client'

import { useActionState } from 'react'
import { Input } from '@/components/ui/Field'
import { Card } from '@/components/ui/Page'
import { SubmitButton } from '@/components/ui/SubmitButton'
import type { AccountResult } from '@/app/(app)/compte/actions'

type Action = (prev: AccountResult, formData: FormData) => Promise<AccountResult>

function Feedback({ state }: { state: AccountResult }) {
  if (state.error)
    return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
  if (state.success)
    return (
      <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
        {state.success}
      </p>
    )
  return null
}

export function IdentityForm({
  action,
  fullName,
  email,
  role,
}: {
  action: Action
  fullName: string
  email: string
  role: string
}) {
  const [state, formAction] = useActionState<AccountResult, FormData>(action, {})

  return (
    <Card className="p-6">
      <h2 className="mb-5 text-sm font-semibold text-navy">Mon identité</h2>
      <form action={formAction} className="flex flex-col gap-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <Input
            id="full_name"
            name="full_name"
            label="Nom complet"
            defaultValue={fullName}
            error={state.fieldErrors?.full_name}
            required
          />
          <Input
            id="email"
            label="Email"
            value={email}
            disabled
            readOnly
            hint="L’email de connexion est géré par l’administration."
          />
        </div>
        <p className="text-xs text-muted">Rôle : {role}</p>
        <Feedback state={state} />
        <div className="flex justify-end">
          <SubmitButton variant="secondary" pendingLabel="Enregistrement…">
            Enregistrer
          </SubmitButton>
        </div>
      </form>
    </Card>
  )
}

export function PasswordForm({ action }: { action: Action }) {
  const [state, formAction] = useActionState<AccountResult, FormData>(action, {})

  return (
    <Card className="p-6">
      <h2 className="mb-1 text-sm font-semibold text-navy">Mot de passe</h2>
      <p className="mb-5 text-xs text-muted">
        Si vous vous connectez avec un mot de passe provisoire fourni par
        l’administration, changez-le maintenant.
      </p>
      <form action={formAction} className="flex flex-col gap-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            label="Nouveau mot de passe"
            minLength={10}
            error={state.fieldErrors?.password}
            hint="10 caractères minimum."
            required
          />
          <Input
            id="confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            label="Confirmation"
            minLength={10}
            error={state.fieldErrors?.confirm}
            required
          />
        </div>
        <Feedback state={state} />
        <div className="flex justify-end">
          <SubmitButton pendingLabel="Modification…">Changer le mot de passe</SubmitButton>
        </div>
      </form>
    </Card>
  )
}
