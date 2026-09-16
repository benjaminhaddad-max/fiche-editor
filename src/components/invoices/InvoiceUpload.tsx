'use client'

import { useActionState, useState } from 'react'
import { FileCheck2, Upload } from 'lucide-react'
import { Card } from '@/components/ui/Page'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { formatDate } from '@/lib/format'
import type { InvoiceActionResult } from '@/app/(app)/factures/actions'
import type { Invoice } from '@/lib/types'

export function InvoiceUpload({
  invoice,
  action,
  revertAction,
  forceAction,
}: {
  invoice: Invoice
  action: (prev: InvoiceActionResult, formData: FormData) => Promise<InvoiceActionResult>
  revertAction: (formData: FormData) => Promise<void>
  forceAction: (formData: FormData) => Promise<void>
}) {
  const [state, formAction] = useActionState<InvoiceActionResult, FormData>(action, {})
  const [filename, setFilename] = useState<string | null>(null)
  const deposited = invoice.pdf_source === 'uploaded'

  return (
    <Card className="mb-6 p-6">
      <div className="mb-4 flex items-start gap-3">
        {deposited ? (
          <FileCheck2 size={18} className="mt-0.5 shrink-0 text-emerald-600" />
        ) : (
          <Upload size={18} className="mt-0.5 shrink-0 text-stone" />
        )}
        <div>
          <h2 className="text-sm font-semibold text-navy">
            {deposited ? 'Votre facture est déposée' : 'Déposer votre propre facture'}
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            {deposited ? (
              <>
                {invoice.uploaded_filename} — déposée le {formatDate(invoice.uploaded_at)}.
                C’est ce document qui sera transmis.
              </>
            ) : (
              <>
                Si vous éditez vos factures avec votre propre outil, déposez le PDF ici. Les
                montants restent ceux validés : votre document remplace seulement celui
                généré par la plateforme.
              </>
            )}
          </p>
        </div>
      </div>

      <form action={formAction} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="invoice_id" value={invoice.id} />
        <input
          type="file"
          name="file"
          accept="application/pdf,.pdf"
          required
          onChange={(e) => setFilename(e.target.files?.[0]?.name ?? null)}
          className="block max-w-xs text-sm text-navy/70
                     file:mr-3 file:cursor-pointer file:rounded-lg file:border-0
                     file:bg-cream-deep file:px-3 file:py-2 file:text-sm file:font-medium
                     file:text-navy/80 hover:file:bg-cream-deep"
        />
        <SubmitButton variant="secondary" pendingLabel="Dépôt…">
          {deposited ? 'Remplacer' : 'Déposer'}
        </SubmitButton>
      </form>

      {filename && !state.error && (
        <p className="mt-2 text-xs text-muted">Fichier sélectionné : {filename}</p>
      )}
      {state.error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      {(state.warning || invoice.ai_check?.matches === false) && (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">{state.warning ?? invoice.ai_check?.message}</p>
          <p className="mt-1 text-xs">
            Déposez une facture corrigée ci-dessus. Si l’écart est voulu, prévenez votre manager
            puis transmettez-la quand même.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={`/messages?nouveau&objet=${encodeURIComponent(`Facture ${invoice.number} : écart de montant`)}`}
              className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
            >
              Écrire à mon manager
            </a>
            <form action={forceAction}>
              <input type="hidden" name="invoice_id" value={invoice.id} />
              <SubmitButton size="sm" variant="secondary" pendingLabel="Envoi…">
                Transmettre quand même
              </SubmitButton>
            </form>
          </div>
        </div>
      )}

      {deposited && (
        <form action={revertAction} className="mt-3">
          <input type="hidden" name="invoice_id" value={invoice.id} />
          <button
            type="submit"
            className="cursor-pointer text-xs text-muted underline hover:text-navy"
          >
            Revenir à la facture générée par la plateforme
          </button>
        </form>
      )}
    </Card>
  )
}
