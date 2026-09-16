'use client'

import { useActionState } from 'react'
import { deposerDocumentContrat, type ContractResult } from '@/app/(app)/admin/contrats/actions'
import { SubmitButton } from '@/components/ui/SubmitButton'

/** Dépôt ou remplacement du PDF signé, depuis la liste des contrats. */
export function ContractDocumentUpload({ contractId, hasDocument }: { contractId: string; hasDocument: boolean }) {
  const [state, action] = useActionState<ContractResult, FormData>(deposerDocumentContrat, {})
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="contract_id" value={contractId} />
      <input
        type="file"
        name="file"
        accept="application/pdf,.pdf"
        required
        aria-label="Contrat signé (PDF)"
        className="max-w-52 text-xs text-navy/70 file:mr-2 file:cursor-pointer file:rounded-md file:border-0 file:bg-cream-deep file:px-2 file:py-1 file:text-xs file:text-navy/80"
      />
      <SubmitButton size="sm" variant="secondary" pendingLabel="…">
        {hasDocument ? 'Remplacer le PDF' : 'Déposer le contrat signé'}
      </SubmitButton>
      {state.error && <span className="text-xs text-red-700">{state.error}</span>}
      {state.success && <span className="text-xs text-emerald-700">{state.success}</span>}
    </form>
  )
}
