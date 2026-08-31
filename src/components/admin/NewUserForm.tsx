'use client'

import { useActionState, useState } from 'react'
import { Input, Select } from '@/components/ui/Field'
import { Card } from '@/components/ui/Page'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { ROLE_LABEL } from '@/lib/labels'
import type { AdminResult } from '@/app/(app)/admin/actions'
import type { Role } from '@/lib/types'

/** Mot de passe provisoire lisible, communique de vive voix au prestataire. */
function generatePassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(14))
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

export function NewUserForm({
  action,
}: {
  action: (prev: AdminResult, formData: FormData) => Promise<AdminResult>
}) {
  const [state, formAction] = useActionState<AdminResult, FormData>(action, {})
  const [role, setRole] = useState<Role>('prestataire')
  const [password, setPassword] = useState('')
  const e = state.fieldErrors ?? {}

  return (
    <Card className="p-6">
      <h2 className="mb-1 text-sm font-semibold text-slate-900">Créer un compte</h2>
      <p className="mb-5 text-xs text-slate-500">
        Le mot de passe est provisoire : communiquez-le à la personne, elle pourra le
        changer ensuite.
      </p>

      <form action={formAction} className="grid gap-5 sm:grid-cols-2">
        <Input
          id="full_name"
          name="full_name"
          label="Nom complet"
          error={e.full_name}
          required
        />
        <Input
          id="email"
          name="email"
          type="email"
          label="Email"
          error={e.email}
          required
        />

        <Select
          id="role"
          name="role"
          label="Rôle"
          value={role}
          onChange={(ev) => setRole(ev.target.value as Role)}
        >
          {(['prestataire', 'manager', 'admin'] as Role[]).map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </Select>

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Input
              id="password"
              name="password"
              label="Mot de passe provisoire"
              value={password}
              onChange={(ev) => setPassword(ev.target.value)}
              error={e.password}
              minLength={8}
              required
            />
          </div>
          <button
            type="button"
            onClick={() => setPassword(generatePassword())}
            className="mb-[1px] cursor-pointer rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Générer
          </button>
        </div>

        {role === 'prestataire' && (
          <div className="sm:col-span-2">
            <Input
              id="legal_name"
              name="legal_name"
              label="Raison sociale du prestataire"
              hint="Le prestataire complétera lui-même son adresse, son SIRET et son IBAN."
              error={e.legal_name}
              required
            />
          </div>
        )}

        {state.error && (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 sm:col-span-2">
            {state.error}
          </p>
        )}
        {state.success && (
          <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800 sm:col-span-2">
            {state.success}
          </p>
        )}

        <div className="flex justify-end sm:col-span-2">
          <SubmitButton pendingLabel="Création…">Créer le compte</SubmitButton>
        </div>
      </form>
    </Card>
  )
}
