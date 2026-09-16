'use client'

import { useActionState, useEffect, useRef } from 'react'
import { ouvrirFil, repondre, type MessageResult } from '@/app/(app)/messages/actions'
import { Input, Select, Textarea } from '@/components/ui/Field'
import { SubmitButton } from '@/components/ui/SubmitButton'

export function NewThreadForm({
  role,
  managers,
  providers,
  statementId,
  defaultSubject,
}: {
  role: 'prestataire' | 'manager' | 'admin'
  managers: { id: string; full_name: string }[]
  providers: { id: string; name: string }[]
  statementId?: string
  defaultSubject?: string
}) {
  const [state, action] = useActionState<MessageResult, FormData>(ouvrirFil, {})
  return (
    <form action={action} className="flex flex-col gap-4">
      {statementId && <input type="hidden" name="statement_id" value={statementId} />}
      <div className="grid gap-4 sm:grid-cols-2">
        {role !== 'prestataire' && (
          <Select id="provider_id" name="provider_id" label="Prestataire" defaultValue="" required>
            <option value="" disabled>
              Choisir…
            </option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        )}
        {role !== 'manager' && (
          <Select
            id="manager_id"
            name="manager_id"
            label={role === 'prestataire' ? 'Écrire à' : 'Manager concerné'}
            defaultValue=""
            required={role === 'prestataire'}
          >
            <option value="" disabled>
              Choisir…
            </option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name}
              </option>
            ))}
          </Select>
        )}
        <div className="sm:col-span-2">
          <Input id="subject" name="subject" label="Objet" defaultValue={defaultSubject} maxLength={160} required />
        </div>
        <div className="sm:col-span-2">
          <Textarea id="body" name="body" label="Message" rows={5} maxLength={5000} required />
        </div>
      </div>
      {role === 'prestataire' && (
        <p className="text-xs text-muted">Votre manager est prévenu par email et par SMS.</p>
      )}
      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Envoi…">Envoyer</SubmitButton>
      </div>
    </form>
  )
}

export function ReplyForm({ threadId }: { threadId: string }) {
  const [state, action] = useActionState<MessageResult, FormData>(repondre, {})
  const ref = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (!state.error) ref.current?.reset()
  }, [state])
  return (
    <form ref={ref} action={action} className="flex flex-col gap-2">
      <input type="hidden" name="thread_id" value={threadId} />
      <textarea name="body" rows={3} required maxLength={5000} placeholder="Votre réponse…" className="field" />
      {state.error && <p className="text-sm text-red-700">{state.error}</p>}
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Envoi…">Envoyer</SubmitButton>
      </div>
    </form>
  )
}
