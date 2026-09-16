'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Download } from 'lucide-react'
import { Badge, InvoiceStatusBadge } from '@/components/ui/Badge'
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

const PENNYLANE: Record<PennylaneStatus, { label: string; style: string }> = {
  not_synced: { label: 'À envoyer', style: 'bg-cream-deep text-navy/70 ring-line' },
  synced: { label: 'Dans Pennylane', style: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  error: { label: 'Erreur', style: 'bg-red-50 text-red-700 ring-red-200' },
}

type Geste = 'valider' | 'pennylane' | 'payer'

export function InvoiceTable({ rows, gestes }: { rows: AdminInvoiceRow[]; gestes: Geste[] }) {
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
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-navy/20 bg-white px-5 py-3">
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
                <th className="px-4 py-3 font-medium">Statut</th>
                <th className="px-4 py-3 font-medium">Pennylane</th>
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
                    <InvoiceStatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={PENNYLANE[r.pennylane_status].style}>{PENNYLANE[r.pennylane_status].label}</Badge>
                    {r.pennylane_error && <p className="mt-1 max-w-56 text-xs text-red-600">{r.pennylane_error}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {r.kind === 'platform' && r.pdf_source === 'uploaded' && ['sent', 'validated'].includes(r.status) && (
                        <button
                          type="button"
                          onClick={() => setRefus(refus === r.id ? null : r.id)}
                          className="cursor-pointer whitespace-nowrap rounded-lg px-2 py-1 text-xs text-navy/70 hover:bg-cream-deep"
                        >
                          À refaire
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
