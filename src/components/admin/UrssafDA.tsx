'use client'

import { useActionState } from 'react'
import { Input } from '@/components/ui/Field'
import { SubmitButton } from '@/components/ui/SubmitButton'
import {
  basculerDeclaration,
  importerHistoriqueDA,
  retirerImportDA,
  type DAResult,
} from '@/app/(app)/admin/droits-auteur/actions'

function Message({ s }: { s: DAResult }) {
  if (s.error) return <p className="text-xs text-red-700">{s.error}</p>
  if (s.success) return <p className="text-xs text-emerald-700">{s.success}</p>
  return null
}

/** Bouton « Marquer déclaré » / « Repasser à déclarer » d'un trimestre. */
export function BoutonDeclaration({ trimestre, declare }: { trimestre: string; declare: boolean }) {
  const [state, action] = useActionState<DAResult, FormData>(basculerDeclaration, {})
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="trimestre" value={trimestre} />
      <input type="hidden" name="declarer" value={declare ? '0' : '1'} />
      <Message s={state} />
      <SubmitButton variant="secondary" size="sm" pendingLabel="…">
        {declare ? 'Repasser à déclarer' : 'Marquer déclaré'}
      </SubmitButton>
    </form>
  )
}

/** Import du tableur d'historique (CSV), repris tel quel. */
export function ImportHistorique() {
  const [state, action] = useActionState<DAResult, FormData>(importerHistoriqueDA, {})
  return (
    <form action={action} className="flex flex-col gap-3">
      <Input
        id="file"
        name="file"
        type="file"
        accept=".csv,text/csv"
        label="Tableur en CSV"
        hint="Colonnes reconnues : Trimestre (ou Date de versement), Auteur, N° sécurité sociale, Brut, Précompte, Net, Contribution. Chaque montant est repris tel quel, rien n'est recalculé ; une case vide reste vide."
        required
      />
      <Message s={state} />
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Import…">Importer</SubmitButton>
      </div>
    </form>
  )
}

/** Retire un import (ses lignes restent en base, marquées retirées). */
export function RetirerImport({ importId }: { importId: string }) {
  const [state, action] = useActionState<DAResult, FormData>(retirerImportDA, {})
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="import_id" value={importId} />
      <Message s={state} />
      <SubmitButton variant="secondary" size="sm" pendingLabel="…">
        Retirer cet import
      </SubmitButton>
    </form>
  )
}
