'use client'

import { useActionState } from 'react'
import { deposerBulletins, type DepotBulletinsResult } from '@/app/(app)/admin/paie/actions'
import { SubmitButton } from '@/components/ui/SubmitButton'

export function BulletinsUpload({ adresse }: { adresse: string | null }) {
  const [state, action] = useActionState<DepotBulletinsResult, FormData>(deposerBulletins, {})
  return (
    <div>
      <form action={action} className="flex flex-wrap items-end gap-3">
        <div>
          <span className="field-label">Bulletins du mois (PDF, 4,5 Mo au total)</span>
          <input
            type="file"
            name="files"
            multiple
            accept="application/pdf,.pdf"
            required
            className="block text-sm text-navy/70 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-cream-deep file:px-3 file:py-2 file:text-sm file:font-medium file:text-navy/80"
          />
        </div>
        <SubmitButton pendingLabel="Lecture des bulletins…">Déposer</SubmitButton>
      </form>
      <p className="mt-2 text-xs text-muted">
        Chaque bulletin est lu : salarié, mois, brut, net et coût employeur. Il est rangé dans l’espace de la
        personne, qui peut le consulter elle-même.
        {adresse && (
          <>
            {' '}
            Le cabinet peut aussi les envoyer à <strong className="text-navy">{adresse}</strong>.
          </>
        )}
      </p>
      {state.success && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{state.success}</p>}
      {state.error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
    </div>
  )
}
