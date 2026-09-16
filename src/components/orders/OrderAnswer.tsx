'use client'

import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { repondreBon } from '@/app/(app)/bons-de-mission/actions'
import { SubmitButton } from '@/components/ui/SubmitButton'

/** Accepter ou refuser un bon de mission, avec un mot si besoin. */
export function OrderAnswer({ orderId }: { orderId: string }) {
  const [refus, setRefus] = useState(false)

  return (
    <div className="flex flex-col items-end gap-2">
      {!refus ? (
        <div className="flex gap-2">
          <form action={repondreBon}>
            <input type="hidden" name="order_id" value={orderId} />
            <input type="hidden" name="decision" value="accept" />
            <SubmitButton size="sm" variant="success" pendingLabel="…">
              <Check size={14} />
              Accepter
            </SubmitButton>
          </form>
          <button
            type="button"
            onClick={() => setRefus(true)}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-navy/80 hover:bg-cream-muted"
          >
            <X size={14} />
            Refuser
          </button>
        </div>
      ) : (
        <form action={repondreBon} className="flex w-72 flex-col gap-2">
          <input type="hidden" name="order_id" value={orderId} />
          <input type="hidden" name="decision" value="decline" />
          <textarea
            name="note"
            rows={2}
            autoFocus
            placeholder="Pourquoi ? (tarif, dates, disponibilité…)"
            className="field text-xs"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setRefus(false)}
              className="cursor-pointer rounded-lg px-2.5 py-1.5 text-xs text-navy/70 hover:bg-cream-deep"
            >
              Annuler
            </button>
            <SubmitButton size="sm" variant="danger" pendingLabel="…">
              Confirmer le refus
            </SubmitButton>
          </div>
        </form>
      )}
    </div>
  )
}
