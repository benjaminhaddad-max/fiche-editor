'use client'

import { useActionState, useState } from 'react'
import { Bell, MessageSquareWarning } from 'lucide-react'
import { Input, Textarea } from '@/components/ui/Field'
import { Card } from '@/components/ui/Page'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { formatDate, money } from '@/lib/format'
import type { ArbitrageResult } from '@/app/(app)/validation/bordereaux/actions'

export interface BordereauAArbitrer {
  id: string
  cycle_month: string
  provider: string
  total_ht: number
  invoice_deadline: string
  invoice_expected_at: string | null
  provider_comment: string | null
  status: string
  reminder_count: number
  lignes: { id: string; detail: string; total_ht: number; status: string; origin: string }[]
}

export function ArbitrageBordereau({
  bordereau,
  clore,
  relancer,
}: {
  bordereau: BordereauAArbitrer
  clore: (prev: ArbitrageResult, formData: FormData) => Promise<ArbitrageResult>
  relancer: (formData: FormData) => Promise<void>
}) {
  const [state, action] = useActionState<ArbitrageResult, FormData>(clore, {})
  const [ouvert, setOuvert] = useState(false)

  const validees = bordereau.lignes.filter((l) => l.status === 'approved')
  const enAttente = bordereau.lignes.filter((l) => ['submitted', 'manager_approved'].includes(l.status))
  const ajouts = bordereau.lignes.filter((l) => l.origin === 'provider')
  const total = validees.reduce((s, l) => s + Number(l.total_ht), 0)
  const clos = bordereau.status === 'accepted' || bordereau.status === 'invoiced'

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-line bg-cream-muted px-5 py-3">
        <p className="font-semibold text-navy">{bordereau.provider}</p>
        <p className="text-sm text-muted">{bordereau.cycle_month}</p>
        {ajouts.length > 0 && (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-200">
            {ajouts.length} ajout{ajouts.length > 1 ? 's' : ''}
          </span>
        )}
        {enAttente.length > 0 && (
          <span className="rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700 ring-1 ring-inset ring-orange-200">
            {enAttente.length} à valider
          </span>
        )}
        <p className="ml-auto font-semibold text-navy">{money(total)} HT</p>
      </div>

      {bordereau.provider_comment && (
        <div className="flex items-start gap-2.5 border-b border-line bg-amber-50 px-5 py-3 text-sm text-amber-900">
          <MessageSquareWarning size={16} className="mt-0.5 shrink-0" />
          <p className="whitespace-pre-wrap">{bordereau.provider_comment}</p>
        </div>
      )}

      <ul className="divide-y divide-line/60">
        {bordereau.lignes.map((l) => (
          <li key={l.id} className="flex items-start justify-between gap-4 px-5 py-2.5 text-sm">
            <span className="text-navy">
              {l.detail}
              {l.origin === 'provider' && (
                <span className="ml-2 text-xs text-amber-700">ajout du prestataire</span>
              )}
            </span>
            <span className="shrink-0 text-navy/70">
              {money(l.total_ht)}
              {l.status !== 'approved' && (
                <span className="ml-2 text-xs text-stone">({l.status})</span>
              )}
            </span>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-3">
        {clos ? (
          <>
            <span className="text-sm text-emerald-700">
              Clos — facture attendue avant le{' '}
              {formatDate(bordereau.invoice_expected_at ?? bordereau.invoice_deadline)}
            </span>
            <form action={relancer} className="ml-auto">
              <input type="hidden" name="statement_id" value={bordereau.id} />
              <SubmitButton size="sm" variant="secondary" pendingLabel="Envoi…">
                <Bell size={14} />
                {bordereau.reminder_count > 0
                  ? `Relancer (${bordereau.reminder_count} déjà)`
                  : 'Relancer'}
              </SubmitButton>
            </form>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setOuvert((o) => !o)}
              className="cursor-pointer rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Clore et autoriser la facturation
            </button>
            {enAttente.length > 0 && (
              <span className="text-xs text-muted">
                {enAttente.length} ligne(s) encore en attente ne seront pas comptées.
              </span>
            )}
          </>
        )}
      </div>

      {ouvert && !clos && (
        <form action={action} className="flex flex-col gap-4 border-t border-line bg-cream-muted px-5 py-4">
          <input type="hidden" name="statement_id" value={bordereau.id} />
          <Textarea
            id={`reponse-${bordereau.id}`}
            name="reponse"
            label="Réponse au prestataire (facultatif)"
            rows={2}
            placeholder="Ex : la séance du 19 a bien été ajoutée, le déplacement n’est pas pris en charge."
            hint="Ce texte apparaîtra dans le mail qu’il recevra."
          />
          <Input
            id={`date-${bordereau.id}`}
            name="invoice_expected_at"
            type="date"
            label="Facture attendue avant le"
            defaultValue={bordereau.invoice_expected_at ?? bordereau.invoice_deadline}
            hint="Modifiable si vous lui avez accordé un délai."
          />
          {state.error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
          )}
          {state.success && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{state.success}</p>
          )}
          <div className="flex justify-end">
            <SubmitButton variant="success" pendingLabel="Clôture…">
              Clore — {money(total)} HT
            </SubmitButton>
          </div>
        </form>
      )}
    </Card>
  )
}
