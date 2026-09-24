'use client'

import { useActionState } from 'react'
import { Send } from 'lucide-react'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { relancerMaintenant, type RelanceResultat } from '@/app/(app)/admin/factures/actions'
import { formatDateLong } from '@/lib/format'

/**
 * La relance du mois, en un clic.
 *
 * Elle part toute seule trois jours avant la clôture ; ce bouton sert quand
 * on veut la déclencher plus tôt, ou une seconde fois. Chacun reçoit le
 * message qui le concerne, personne n'en reçoit deux.
 */
export function RelanceBouton({
  declaration,
  facture,
}: {
  declaration: string
  facture: string
}) {
  const [state, action] = useActionState<RelanceResultat | null, FormData>(relancerMaintenant, null)

  return (
    <form action={action} className="rounded-xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-navy">Relancer tout le monde</p>
          <p className="mt-1 max-w-2xl text-xs text-muted">
            Aux prestataires : déclarez avant le {formatDateLong(declaration)} — et un lien d’accès à ceux qui ne
            se sont jamais connectés. Aux managers : vos factures diverses doivent être reçues avant le{' '}
            {formatDateLong(facture)}. Ceux qui ont déjà déclaré ne reçoivent rien.
          </p>
        </div>
        <SubmitButton pendingLabel="Envoi en cours…">
          <Send size={15} />
          Envoyer la relance
        </SubmitButton>
      </div>

      {state?.message && (
        <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{state.message}</p>
      )}
      {state?.error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
    </form>
  )
}
