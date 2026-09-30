'use client'

import { Fragment, useState } from 'react'
import Link from 'next/link'
import { clsx } from 'clsx'
import { AlertTriangle, Bell, ChevronRight, MessageSquare } from 'lucide-react'
import { InvoiceStatusBadge } from '@/components/ui/Badge'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { formatDate, money } from '@/lib/format'
import type { AiCheck, InvoiceStatus } from '@/lib/types'

export interface LigneDetail {
  id: string
  detail: string
  date: string
  categorie: string
  manager: string
  /** Vrai si c'est celui qui regarde qui l'a validée. */
  sienne: boolean
  montant: number
  status: string
}

/**
 * Une personne, son bordereau, et ce qu'il y a dedans.
 *
 * La ligne ne montrait qu'un total. « Tu vois le total, mais tu vois pas le
 * détail » — et sans le détail, un manager qui relit son mois ne peut ni
 * vérifier ce qu'il a validé, ni répondre à quelqu'un qui conteste une
 * somme. On ouvre donc le total.
 */
export function LigneBordereau({
  nom,
  salarie,
  enAttente,
  total,
  sienne,
  montrerSienne,
  lignes,
  facture,
  statementId,
  relanceCount,
  attendue,
  envoye,
  objetMessage,
  relancer,
}: {
  nom: string
  salarie: boolean
  enAttente: number
  total: number
  sienne: number
  montrerSienne: boolean
  lignes: LigneDetail[]
  facture: { id: string; number: string; status: InvoiceStatus; ai_check: AiCheck | null } | null
  statementId: string | null
  relanceCount: number
  attendue: boolean
  envoye: boolean
  objetMessage: string
  relancer: (fd: FormData) => Promise<void>
}) {
  const [ouvert, setOuvert] = useState(false)
  const colonnes = montrerSienne ? 5 : 4

  return (
    <Fragment>
      <tr className="align-top">
        <td className="px-4 py-3">
          <button
            type="button"
            onClick={() => setOuvert((v) => !v)}
            title={ouvert ? 'Replier le détail' : 'Voir le détail du mois'}
            className="flex cursor-pointer items-start gap-1.5 text-left"
          >
            <ChevronRight
              size={14}
              className={clsx('mt-0.5 shrink-0 text-navy/40 transition-transform', ouvert && 'rotate-90')}
            />
            <span>
              <span className="font-medium text-navy">{nom}</span>
              <span className="block text-xs text-muted">
                {lignes.length} prestation{lignes.length > 1 ? 's' : ''}
              </span>
            </span>
          </button>
          {salarie && <p className="mt-1 text-xs text-muted">Salarié — part à la paie</p>}
          {enAttente > 0 && <p className="text-xs text-amber-700">{enAttente} ligne(s) encore à valider</p>}
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-navy">{money(total)}</td>
        {montrerSienne && (
          <td className="whitespace-nowrap px-4 py-3 text-right text-navy/70">{money(sienne)}</td>
        )}
        <td className="px-4 py-3">
          {salarie ? (
            <span className="text-xs text-muted">—</span>
          ) : facture ? (
            <div className="flex flex-wrap items-center gap-2">
              <InvoiceStatusBadge status={facture.status} />
              <span className="text-xs text-navy/70">{facture.number}</span>
              {facture.ai_check?.matches === false && (
                <span
                  className="inline-flex items-center gap-1 text-xs text-amber-700"
                  title={facture.ai_check.message ?? ''}
                >
                  <AlertTriangle size={12} />
                  écart de montant
                </span>
              )}
            </div>
          ) : (
            <span className="text-xs text-muted">
              {envoye ? 'Pas encore reçue' : 'Bordereau pas encore envoyé'}
            </span>
          )}
        </td>
        <td className="px-4 py-3">
          <div className="flex justify-end gap-1.5">
            {attendue && statementId && (
              <form action={relancer}>
                <input type="hidden" name="statement_id" value={statementId} />
                <SubmitButton size="sm" variant="secondary" pendingLabel="…" title="Email + SMS">
                  <Bell size={13} />
                  Relancer{relanceCount ? ` (${relanceCount})` : ''}
                </SubmitButton>
              </form>
            )}
            <Link
              href={`/messages?nouveau&objet=${encodeURIComponent(objetMessage)}`}
              title="Écrire au prestataire"
              className="inline-flex items-center rounded-lg border border-line px-2 py-1.5 text-navy/70 hover:bg-cream-muted"
            >
              <MessageSquare size={13} />
            </Link>
          </div>
        </td>
      </tr>

      {ouvert && (
        <tr className="bg-cream-muted/40">
          <td colSpan={colonnes} className="px-4 pb-3 pt-0">
            <ul className="divide-y divide-line/50 rounded-lg border border-line bg-white">
              {lignes.map((l) => (
                <li key={l.id} className="flex items-start justify-between gap-4 px-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="text-navy">{l.detail}</span>
                    <span className="block text-xs text-muted">
                      {formatDate(l.date)} · {l.categorie} · {l.manager}
                      {l.sienne ? ' (vous)' : ''}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    {l.status === 'submitted' && (
                      <span className="rounded-full bg-amber-50 px-2 py-px text-[11px] font-medium text-amber-800 ring-1 ring-amber-200">
                        pas encore validée
                      </span>
                    )}
                    <span className="w-24 text-right font-medium text-navy">{money(l.montant)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </td>
        </tr>
      )}
    </Fragment>
  )
}
