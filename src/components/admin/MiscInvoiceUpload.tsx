'use client'

import { useActionState } from 'react'
import { deposerFacturesDiverses, type DepotDiversResult } from '@/app/(app)/admin/factures/actions'
import { Select } from '@/components/ui/Field'
import { SubmitButton } from '@/components/ui/SubmitButton'

export function MiscInvoiceUpload({
  categories,
  inboundAddress,
}: {
  categories: { id: string; name: string }[]
  inboundAddress: string | null
}) {
  const [state, action] = useActionState<DepotDiversResult, FormData>(deposerFacturesDiverses, {})
  return (
    <div>
      <form action={action} className="flex flex-wrap items-end gap-3">
        <div>
          <span className="field-label">Factures (PDF, 4,5 Mo au total)</span>
          <input
            type="file"
            name="files"
            multiple
            accept="application/pdf,.pdf"
            required
            className="block text-sm text-navy/70 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-cream-deep file:px-3 file:py-2 file:text-sm file:font-medium file:text-navy/80"
          />
        </div>
        <div className="w-64">
          <Select id="category_id" name="category_id" label="Catégorie" defaultValue="">
            <option value="">Choisie par la lecture</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <SubmitButton pendingLabel="Lecture des factures…">Déposer</SubmitButton>
      </form>
      <p className="mt-2 text-xs text-muted">
        Chaque PDF est lu : fournisseur retrouvé (ou créé, sans compte) et montants repris. La facture arrive
        directement chez Benjamin, dans les factures validées.
        {inboundAddress && (
          <>
            {' '}
            Vous pouvez aussi les envoyer par email à <strong className="text-navy">{inboundAddress}</strong> (relevé
            toutes les heures).
          </>
        )}
      </p>
      {state.success && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{state.success}</p>}
      {state.error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
    </div>
  )
}
