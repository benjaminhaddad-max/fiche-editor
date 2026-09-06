'use client'

import { useActionState, useState } from 'react'
import { Upload } from 'lucide-react'
import { Card } from '@/components/ui/Page'
import { SubmitButton } from '@/components/ui/SubmitButton'
import type { DepotResult } from '@/app/(app)/factures/deposer/actions'

export function DepotForm({
  action,
}: {
  action: (prev: DepotResult, formData: FormData) => Promise<DepotResult>
}) {
  const [state, formAction] = useActionState<DepotResult, FormData>(action, {})
  const [fichier, setFichier] = useState<string | null>(null)

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-start gap-3">
        <Upload size={18} className="mt-0.5 shrink-0 text-slate-400" />
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Déposez votre facture</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Nous en lisons les lignes pour que vous puissiez indiquer, pour chacune, qui
            l’a commandée. Chaque responsable validera sa propre ligne.
          </p>
        </div>
      </div>

      <form action={formAction} className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          name="file"
          accept="application/pdf,.pdf"
          required
          onChange={(e) => setFichier(e.target.files?.[0]?.name ?? null)}
          className="block max-w-xs text-sm text-slate-600
                     file:mr-3 file:cursor-pointer file:rounded-lg file:border-0
                     file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium
                     file:text-slate-700 hover:file:bg-slate-200"
        />
        <SubmitButton pendingLabel="Lecture du document…">Déposer et lire</SubmitButton>
      </form>

      {fichier && !state.error && (
        <p className="mt-2 text-xs text-slate-500">Fichier sélectionné : {fichier}</p>
      )}
      {state.error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}
    </Card>
  )
}
