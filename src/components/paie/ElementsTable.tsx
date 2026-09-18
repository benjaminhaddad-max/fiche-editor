'use client'

import { useState } from 'react'
import { AlertTriangle, Bell, FileText } from 'lucide-react'
import { relancerElements } from '@/app/(app)/paie-du-mois/actions'
import { Card } from '@/components/ui/Page'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { formatDate, money } from '@/lib/format'
import { EMPLOYMENT_LABEL } from '@/lib/labels'
import type { LigneElements } from '@/lib/paie/elements'

const MUTUELLE: Record<string, string> = { adherent: 'adhérent', refus: 'refus', inconnu: '—' }

export function ElementsTable({ mois, lignes }: { mois: string; lignes: LigneElements[] }) {
  const manquants = lignes.filter((l) => !l.rempli)
  const [selection, setSelection] = useState<Set<string>>(() => new Set(manquants.map((l) => l.providerId)))

  const bascule = (id: string) =>
    setSelection((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  return (
    <>
      {selection.size > 0 && (
        <form
          action={relancerElements}
          className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold/40 bg-gold/10 px-5 py-3"
        >
          <input type="hidden" name="mois" value={mois} />
          {[...selection].map((id) => (
            <input key={id} type="hidden" name="provider_id" value={id} />
          ))}
          <span className="text-sm text-navy">
            <strong>{selection.size}</strong> personne{selection.size > 1 ? 's' : ''} à relancer — email et SMS.
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSelection(new Set())}
              className="cursor-pointer rounded-lg px-3 py-1.5 text-sm text-navy/70 hover:bg-white"
            >
              Annuler
            </button>
            <SubmitButton size="sm" pendingLabel="Envoi…">
              <Bell size={14} />
              Relancer
            </SubmitButton>
          </div>
        </form>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-cream-muted text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="w-10 px-4 py-3" />
                <th className="px-4 py-3 font-medium">Personne</th>
                <th className="px-4 py-3 text-right font-medium">H. sup.</th>
                <th className="px-4 py-3 text-right font-medium">CP</th>
                <th className="px-4 py-3 text-right font-medium">Sans solde</th>
                <th className="px-4 py-3 font-medium">Transport</th>
                <th className="px-4 py-3 font-medium">Mutuelle</th>
                <th className="px-4 py-3 font-medium">Remarque</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {lignes.map((l) => (
                <tr key={l.providerId} className={l.rempli ? 'align-top' : 'bg-amber-50/40 align-top'}>
                  <td className="px-4 py-3">
                    {!l.rempli && (
                      <input
                        type="checkbox"
                        checked={selection.has(l.providerId)}
                        onChange={() => bascule(l.providerId)}
                        aria-label={`Relancer ${l.nom}`}
                        className="h-4 w-4 cursor-pointer accent-navy"
                      />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-navy">{l.nom}</p>
                    <p className="text-xs text-muted">{EMPLOYMENT_LABEL[l.statut]}</p>
                    {!l.rempli && (
                      <p className="mt-1 inline-flex items-center gap-1 text-xs text-amber-700">
                        <AlertTriangle size={12} />
                        pas encore répondu
                        {l.relanceLe ? ` · relancé le ${formatDate(l.relanceLe)}` : ''}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-navy/80">{l.rempli ? l.heuresSup : '—'}</td>
                  <td className="px-4 py-3 text-right text-navy/80">{l.rempli ? l.congesPayes : '—'}</td>
                  <td className="px-4 py-3 text-right text-navy/80">{l.rempli ? l.congesSansSolde : '—'}</td>
                  <td className="px-4 py-3">
                    {!l.rempli ? (
                      <span className="text-muted">—</span>
                    ) : l.transport ? (
                      <span className="flex flex-wrap items-center gap-2 text-navy/80">
                        {l.montantTransport === null ? 'oui' : money(l.montantTransport)}
                        {l.justificatifId ? (
                          <a
                            href={`/api/documents/${l.justificatifId}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-medium text-gold-dark hover:underline"
                          >
                            <FileText size={12} />
                            justificatif
                          </a>
                        ) : (
                          <span className="text-xs text-amber-700">sans justificatif</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-navy/60">non</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-navy/80">{l.rempli ? MUTUELLE[l.mutuelle] : '—'}</td>
                  <td className="px-4 py-3 text-xs text-navy/70">
                    {l.detailConges && <p>{l.detailConges}</p>}
                    {l.commentaire && <p className="mt-0.5 text-amber-800">{l.commentaire}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}
