'use client'

import { useActionState, useState } from 'react'
import { Check, Copy, Link2 } from 'lucide-react'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { Button } from '@/components/ui/Button'
import { rattacherJustificatif, type ResultatJustificatif } from '@/app/(app)/remunerations/justificatifs-actions'

/** Un clic : le reçu part dans Pennylane, sur ce mouvement. */
export function BoutonRattacher({ id, transactionId, principal }: { id: string; transactionId: number; principal: boolean }) {
  const [etat, agir] = useActionState<ResultatJustificatif | null, FormData>(rattacherJustificatif, null)
  return (
    <form action={agir} className="flex shrink-0 flex-col items-end gap-1">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="transaction_id" value={transactionId} />
      <SubmitButton size="sm" variant={principal ? 'primary' : 'secondary'} pendingLabel="Dépôt…">
        <Link2 size={13} />
        Rattacher
      </SubmitButton>
      {etat && !etat.ok && <span className="max-w-xs text-right text-xs text-red-700">{etat.message}</span>}
    </form>
  )
}

/** Le texte de relance, déplié à la demande et copié d'un clic. Rien ne part d'ici. */
export function TexteACopier({ texte }: { texte: string }) {
  const [copie, setCopie] = useState(false)
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs font-medium text-navy/70 hover:text-navy">Texte de relance</summary>
      <div className="mt-2 rounded-lg border border-line bg-cream-muted p-3">
        <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap font-sans text-xs text-navy">{texte}</pre>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="mt-2"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(texte)
              setCopie(true)
              setTimeout(() => setCopie(false), 2000)
            } catch {
              setCopie(false)
            }
          }}
        >
          {copie ? <Check size={13} /> : <Copy size={13} />}
          {copie ? 'Copié' : 'Copier'}
        </Button>
      </div>
    </details>
  )
}
