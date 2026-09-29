'use client'

import { useActionState } from 'react'
import { Send, Siren } from 'lucide-react'
import { SubmitButton } from '@/components/ui/SubmitButton'
import {
  envoyerAuSocial,
  relancerPourLaPaie,
  type EnvoiSocial,
} from '@/app/(app)/admin/paie/actions'

/**
 * Les deux gestes du mois côté paie.
 *
 * Envoyer ce qui est acquis à qui prépare les bulletins, et réveiller ceux
 * qui retiennent des lignes de salariés. Ces deux-là sont séparés du reste
 * parce que la paie ne suit pas le rythme des factures : un bulletin se
 * prépare plus tôt qu'un virement, et une ligne validée trop tard bascule
 * sur le mois suivant.
 */
export function BoutonsSocial({
  mois,
  pretes,
  enAttente,
  contact,
}: {
  mois: string
  /** Combien de lignes sont validées et prêtes à partir. */
  pretes: number
  /** Combien attendent encore la validation d'un manager. */
  enAttente: number
  /** Qui reçoit le récapitulatif. Sans lui, on ne propose pas l'envoi. */
  contact: string | null
}) {
  const [envoi, envoyer] = useActionState<EnvoiSocial | null, FormData>(envoyerAuSocial, null)
  const [relance, relancer] = useActionState<EnvoiSocial | null, FormData>(relancerPourLaPaie, null)
  const etat = envoi ?? relance

  return (
    <div className="mb-6 flex flex-col gap-3 rounded-xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-navy">
            {contact ? `Envoyer les éléments à ${contact}` : 'Envoyer les éléments au service paie'}
          </p>
          <p className="mt-1 text-xs text-muted">
            {pretes === 0
              ? 'Rien de validé pour l’instant : il n’y a rien à transmettre.'
              : `${pretes} ligne${pretes > 1 ? 's' : ''} validée${pretes > 1 ? 's' : ''} partiront, avec le détail par personne.`}
            {enAttente > 0 &&
              ` ${enAttente} ligne${enAttente > 1 ? 's' : ''} encore en attente ${enAttente > 1 ? 'seront signalées' : 'sera signalée'} dans le message, sans être comptée${enAttente > 1 ? 's' : ''}.`}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {enAttente > 0 && (
            <form action={relancer}>
              <input type="hidden" name="mois" value={mois} />
              <SubmitButton size="sm" variant="secondary" pendingLabel="Envoi…">
                <Siren size={14} />
                Relancer pour la paie
              </SubmitButton>
            </form>
          )}
          <form action={envoyer}>
            <input type="hidden" name="mois" value={mois} />
            <SubmitButton size="sm" pendingLabel="Envoi…" disabled={!pretes || !contact}>
              <Send size={14} />
              {contact ? `Envoyer à ${contact.split(' ')[0]}` : 'Envoyer au social'}
            </SubmitButton>
          </form>
        </div>
      </div>

      {!contact && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Aucun interlocuteur paie n’est renseigné pour cette école : l’envoi est désactivé plutôt
          que de partir à l’aveugle.
        </p>
      )}
      {etat?.message && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{etat.message}</p>
      )}
      {etat?.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{etat.error}</p>}
    </div>
  )
}
