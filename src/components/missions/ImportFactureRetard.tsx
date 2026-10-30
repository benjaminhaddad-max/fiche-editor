'use client'

import { FileUp } from 'lucide-react'
import { Card } from '@/components/ui/Page'
import { SubmitButton } from '@/components/ui/SubmitButton'
import type { ImportResult } from '@/app/(app)/declarations/actions'

/**
 * Importer la facture d'un intervenant qui l'a envoyée en retard.
 *
 * Elle est lue, pas enregistrée : ses lignes atterrissent dans le
 * formulaire juste en dessous, où elles se relisent et se corrigent avant
 * d'être déclarées. C'est ce qui évite de tout retaper sans pour autant
 * payer sur la foi d'un PDF.
 *
 * L'état vit dans le formulaire parent, qui remplit ses lignes à la
 * réception d'une lecture ; cette carte ne fait que l'afficher — et reste
 * un formulaire voisin, puisqu'un formulaire ne s'imbrique pas.
 */
export function ImportFactureRetard({
  formAction,
  state,
}: {
  formAction: (fd: FormData) => void
  state: ImportResult
}) {
  return (
    <Card className="p-5">
      <form action={formAction} className="flex flex-col gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-navy">
            <FileUp size={15} />
            Importer une facture envoyée en retard
          </h2>
          <p className="mt-1 text-sm text-muted">
            Le PDF est lu et ses lignes remplissent le formulaire ci-dessous. Rien n’est enregistré avant que
            vous ne déclariez.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            name="facture"
            accept="application/pdf,.pdf"
            required
            className="block text-sm text-navy/70 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-cream-deep file:px-3 file:py-2 file:text-sm file:font-medium file:text-navy/80"
          />
          <SubmitButton variant="secondary" pendingLabel="Lecture de la facture…">
            Lire la facture
          </SubmitButton>
        </div>
        {state.error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</p>}
        {state.resume && (
          <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{state.resume}</p>
        )}
      </form>
    </Card>
  )
}
