'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Download, Undo2 } from 'lucide-react'
import { Card } from '@/components/ui/Page'
import { SubmitButton } from '@/components/ui/SubmitButton'
import {
  demanderNouvelleFacture,
  envoyerPennylane,
  marquerPayees,
  validerFactures,
  type LotResultat,
} from '@/app/(app)/admin/factures/actions'
import { formatDate, money } from '@/lib/format'
import type { AiCheck, InvoiceStatus, PennylaneStatus } from '@/lib/types'

export interface AdminInvoiceRow {
  id: string
  number: string
  status: InvoiceStatus
  kind: 'platform' | 'misc'
  issue_date: string
  subtotal_ht: number
  total_ttc: number
  pennylane_status: PennylaneStatus
  pennylane_error: string | null
  pdf_source: string
  channel: string | null
  ai_check: AiCheck | null
  provider: string
  sansCompte: boolean
  apportePar: string | null
}

type Geste = 'valider' | 'pennylane' | 'payer'

/** Où en est une facture, et ce qui la fera avancer. */
function ETAPE(r: AdminInvoiceRow): { titre: string; suite: string } {
  if (r.status === 'paid') return { titre: 'Payée', suite: 'Rien à faire.' }
  if (r.status === 'issued') return { titre: 'En attente de son PDF', suite: 'Le prestataire doit le déposer.' }
  if (r.pennylane_status === 'error') return { titre: 'Refusée par Pennylane', suite: 'À renvoyer après correction.' }
  if (r.status === 'sent') return { titre: 'Reçue', suite: 'À vérifier, puis valider.' }
  if (r.pennylane_status === 'synced') return { titre: 'En comptabilité', suite: 'En attente du règlement.' }
  return { titre: 'Validée', suite: 'À envoyer dans Pennylane.' }
}

export function InvoiceTable({
  rows,
  gestes,
  doublons = {},
}: {
  rows: AdminInvoiceRow[]
  gestes: Geste[]
  /** Factures déjà en comptabilité au même montant, par facture. */
  doublons?: Record<string, { date: string; montant: number; libelle: string; payee: boolean }[]>
}) {
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [refus, setRefus] = useState<string | null>(null)
  const [lot, envoyer] = useActionState<LotResultat | null, FormData>(envoyerPennylane, null)
  const tous = rows.length > 0 && rows.every((r) => selection.has(r.id))
  const choisis = rows.filter((r) => selection.has(r.id))
  const bascule = (id: string) =>
    setSelection((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const caches = [...selection].map((id) => <input key={id} type="hidden" name="invoice_id" value={id} />)

  return (
    <>
      {selection.size > 0 && (
        <div className="mb-3 rounded-xl border border-navy/20 bg-white px-5 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-navy">
            <strong>{selection.size}</strong> facture{selection.size > 1 ? 's' : ''} —{' '}
            <strong>{money(choisis.reduce((s, r) => s + Number(r.total_ttc), 0))} TTC</strong>
          </span>
          <div className="flex flex-wrap gap-2">
            {gestes.includes('valider') && (
              <form action={validerFactures}>
                {caches}
                <SubmitButton size="sm" pendingLabel="…">Valider</SubmitButton>
              </form>
            )}
            {gestes.includes('pennylane') && (
              <form action={envoyer}>
                {caches}
                <SubmitButton size="sm" variant="success" pendingLabel="Envoi dans Pennylane…">
                  Envoyer dans Pennylane
                </SubmitButton>
              </form>
            )}
            {gestes.includes('payer') && (
              <form action={marquerPayees}>
                {caches}
                <SubmitButton size="sm" variant="secondary" pendingLabel="…">Marquer payées</SubmitButton>
              </form>
            )}
          </div>
          </div>
          {/* Les deux gestes se ressemblaient à l'écran alors qu'un seul
              sort de la plateforme. On dit lequel fait quoi, là où on
              clique. */}
          <p className="mt-2 border-t border-line pt-2 text-xs text-muted">
            <strong className="font-medium text-navy/80">Valider</strong> ne fait que marquer « j’ai vérifié » —
            rien ne quitte la plateforme, et ce n’est pas obligatoire.{' '}
            <strong className="font-medium text-navy/80">Envoyer dans Pennylane</strong> transfère vraiment la
            facture et son PDF en comptabilité.{' '}
            <strong className="font-medium text-navy/80">Marquer payées</strong> sert aux virements faits à la
            main : sinon le paiement revient tout seul de Pennylane.
          </p>
        </div>
      )}

      {lot && (
        <div className={`mb-3 rounded-lg px-4 py-3 text-sm ${lot.erreurs.length ? 'bg-amber-50 text-amber-900' : 'bg-emerald-50 text-emerald-800'}`}>
          {lot.ok} facture{lot.ok > 1 ? 's' : ''} envoyée{lot.ok > 1 ? 's' : ''} dans Pennylane.
          {lot.erreurs.map((e) => (
            <p key={e.numero} className="mt-1 text-xs">
              {e.numero} : {e.message}
            </p>
          ))}
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-cream-muted text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={tous}
                    onChange={() => setSelection(tous ? new Set() : new Set(rows.map((r) => r.id)))}
                    className="h-4 w-4 cursor-pointer accent-navy"
                    aria-label="Tout sélectionner"
                  />
                </th>
                <th className="px-4 py-3 font-medium">Fournisseur</th>
                <th className="px-4 py-3 font-medium">Numéro</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 text-right font-medium">TTC</th>
                <th className="px-4 py-3 font-medium">Où ça en est</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {rows.map((r) => (
                <tr key={r.id} className={selection.has(r.id) ? 'bg-cream-muted align-top' : 'align-top'}>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selection.has(r.id)}
                      onChange={() => bascule(r.id)}
                      className="h-4 w-4 cursor-pointer accent-navy"
                      aria-label={`Sélectionner ${r.number}`}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-navy">{r.provider}</p>
                    <p className="text-xs text-muted">
                      {r.kind === 'misc' ? `Facture diverse${r.channel === 'email' ? ' reçue par email' : ''}` : 'Prestations'}
                      {r.sansCompte ? ' · sans compte' : ''}
                      {r.apportePar ? ` · via ${r.apportePar}` : ''}
                    </p>
                    {doublons[r.id]?.length ? (
                      /* Le même montant déjà passé en compta : c'est ainsi
                         qu'on paie deux fois la même prestation, une fois par
                         la plateforme et une fois en direct. */
                      <div className="mt-1.5 rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
                        <p className="font-semibold">Même montant déjà en comptabilité</p>
                        {doublons[r.id].map((d, i) => (
                          <p key={i} className="mt-0.5">
                            {money(d.montant)} le {formatDate(d.date)} — {d.libelle}
                            {d.payee ? ' · déjà réglée' : ''}
                          </p>
                        ))}
                        <p className="mt-0.5 text-amber-800/80">Vérifiez qu’il ne s’agit pas de la même prestation.</p>
                      </div>
                    ) : null}
                    {r.ai_check?.matches === false && (
                      <p className="mt-1 flex items-start gap-1 text-xs text-amber-700">
                        <AlertTriangle size={12} className="mt-px shrink-0" />
                        {r.ai_check.message}
                      </p>
                    )}
                    {refus === r.id && (
                      <form
                        action={async (fd) => {
                          await demanderNouvelleFacture(fd)
                          setRefus(null)
                        }}
                        className="mt-2 flex flex-col gap-2"
                      >
                        <input type="hidden" name="invoice_id" value={r.id} />
                        <textarea name="motif" rows={2} required minLength={3} autoFocus className="field text-xs" placeholder="Ce qui ne va pas (envoyé au prestataire)…" />
                        <div className="flex gap-2">
                          <SubmitButton size="sm" variant="danger" pendingLabel="…">Demander une nouvelle facture</SubmitButton>
                          <button type="button" onClick={() => setRefus(null)} className="cursor-pointer text-xs text-navy/70">
                            Annuler
                          </button>
                        </div>
                      </form>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <Link href={`/admin/factures/${r.id}`} className="font-medium text-gold-dark hover:underline">
                      {r.number}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-navy/70">{formatDate(r.issue_date)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-navy">{money(r.total_ttc)}</td>
                  <td className="px-4 py-3">
                    {/* Deux colonnes d'état côte à côte — le statut et
                        Pennylane — obligeaient à les croiser de tête pour
                        savoir ce qu'il restait à faire. Une seule phrase. */}
                    <p className="text-sm font-medium text-navy">{ETAPE(r).titre}</p>
                    <p className="mt-0.5 text-xs text-muted">{ETAPE(r).suite}</p>
                    {r.pennylane_error && <p className="mt-1 max-w-56 text-xs text-red-600">{r.pennylane_error}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {r.kind === 'platform' && r.pdf_source === 'uploaded' && ['sent', 'validated'].includes(r.status) && (
                        /* « À refaire » se lisait comme un verdict, aligné
                           qu'il était sur les pastilles d'état : Benjamin a
                           cru que trois factures posaient problème. C'est une
                           action, et elle s'énonce comme telle. */
                        <button
                          type="button"
                          onClick={() => setRefus(refus === r.id ? null : r.id)}
                          title="Renvoyer cette facture à son auteur pour correction"
                          className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-lg border border-line px-2 py-1 text-xs text-navy/70 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                        >
                          <Undo2 size={13} />
                          Demander une correction
                        </button>
                      )}
                      <a
                        href={`/api/factures/${r.id}/pdf`}
                        target="_blank"
                        rel="noreferrer"
                        title="PDF"
                        className="inline-flex rounded p-1.5 text-muted hover:bg-cream-deep hover:text-navy"
                      >
                        <Download size={15} />
                      </a>
                    </div>
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
