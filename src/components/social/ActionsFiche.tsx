'use client'

import { useActionState, useState } from 'react'
import { Check, Pencil, Undo2 } from 'lucide-react'
import { renvoyerSaisie, validerSaisie, type Resultat } from '@/app/(app)/social/actions'
import { Textarea } from '@/components/ui/Field'
import { SubmitButton } from '@/components/ui/SubmitButton'

/** Valider, renvoyer au salarié avec un commentaire, ou ouvrir la correction. */
export function ActionsFiche({
  providerId,
  mois,
  peutValider,
  peutRenvoyer,
  anomalies,
  onCorriger,
}: {
  providerId: string
  mois: string
  peutValider: boolean
  peutRenvoyer: boolean
  anomalies: number
  onCorriger?: string
}) {
  const [v, valider] = useActionState<Resultat, FormData>(validerSaisie, {})
  const [r, renvoyer] = useActionState<Resultat, FormData>(renvoyerSaisie, {})
  const [ouvert, setOuvert] = useState(false)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {peutValider && (
          <form
            action={valider}
            onSubmit={(e) => {
              if (anomalies && !confirm(`${anomalies} anomalie(s) signalée(s). Valider quand même ?`)) e.preventDefault()
            }}
          >
            <input type="hidden" name="provider_id" value={providerId} />
            <input type="hidden" name="mois" value={mois} />
            <SubmitButton size="sm" pendingLabel="…">
              <Check size={14} />
              Valider
            </SubmitButton>
          </form>
        )}
        {peutRenvoyer && (
          <button
            type="button"
            onClick={() => setOuvert((o) => !o)}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs font-medium text-navy hover:bg-cream-muted"
          >
            <Undo2 size={14} />
            Renvoyer au salarié
          </button>
        )}
        {onCorriger && (
          <a
            href={onCorriger}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs font-medium text-navy hover:bg-cream-muted"
          >
            <Pencil size={14} />
            Corriger
          </a>
        )}
      </div>
      {ouvert && (
        <form action={renvoyer} className="flex flex-col gap-2 rounded-lg border border-line bg-cream-muted/60 p-3">
          <input type="hidden" name="provider_id" value={providerId} />
          <input type="hidden" name="mois" value={mois} />
          <Textarea id="commentaire" name="commentaire" label="Ce qu’il doit corriger" rows={2} required placeholder="Ex : le justificatif Navigo est celui d’octobre" />
          <div>
            <SubmitButton size="sm" variant="secondary" pendingLabel="Envoi…">
              Renvoyer avec ce commentaire (email + SMS)
            </SubmitButton>
          </div>
        </form>
      )}
      {[v, r].map((x, i) => (
        <div key={i}>
          {x.success && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{x.success}</p>}
          {x.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{x.error}</p>}
        </div>
      ))}
    </div>
  )
}
