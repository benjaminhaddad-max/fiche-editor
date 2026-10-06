import Link from 'next/link'
import { RefreshCw } from 'lucide-react'
import { ARattacher } from '@/components/admin/ARattacher'
import { InvoiceTable, type AdminInvoiceRow } from '@/components/admin/InvoiceTable'
import { MiscInvoiceUpload } from '@/components/admin/MiscInvoiceUpload'
import { Card, EmptyState } from '@/components/ui/Page'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { actualiserPaiements } from '@/app/(app)/admin/factures/actions'
import { money } from '@/lib/format'
import { chercherDoublons } from '@/lib/invoice/doublons'
import { getManagers } from '@/lib/queries'
import { createServerSupabase } from '@/lib/supabase/server'
import type { AiCheck, InvoiceStatus, PennylaneStatus } from '@/lib/types'
import { brandScope, getBrandId } from '@/lib/brand'

interface Row {
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
  inbound_from: string | null
  inbound_match: string | null
  ai_check: AiCheck | null
  provider: { legal_name: string; user_id: string | null } | null
  apporteur: { full_name: string } | null
}

/**
 * Les quatre temps d'une facture, dans l'ordre où on les traverse.
 *
 * L'écran en montrait trois mélangés — « transmises », « validées »,
 * « payées » — avec l'état Pennylane dans une colonne à part, si bien qu'on
 * ne savait pas ce qu'il restait à faire ni dans quel ordre. Les étapes sont
 * numérotées, et chacune dit le geste qui la fait avancer.
 */
const ONGLETS = {
  transmises: { label: 'Reçues', statuts: ['sent'] },
  validees: { label: 'Validées', statuts: ['validated'] },
  payees: { label: 'Payées', statuts: ['paid'] },
  attente: { label: 'En attente du PDF', statuts: ['issued'] },
} as const

/** Les factures reçues, à valider puis à envoyer dans Pennylane. */
export async function VueFactures({ onglet }: { onglet?: string }) {
  const supabase = await createServerSupabase()

  const [{ data }, { data: cats }, managers] = await Promise.all([
    supabase
      .from('inv_invoices')
      .select(
        `id, number, status, kind, issue_date, subtotal_ht, total_ttc, pennylane_status, pennylane_error,
         pdf_source, channel, inbound_from, inbound_match, ai_check,
         provider:inv_providers(legal_name, user_id),
         apporteur:inv_users!inv_invoices_submitted_by_fkey(full_name)`
      )
      .eq('brand', getBrandId())
      .order('issue_date', { ascending: false }),
    supabase
      .from('inv_categories')
      .select('id, name')
      .in('brand', brandScope())
      .eq('is_active', true)
      .order('sort_order'),
    getManagers(),
  ])

  const rows: AdminInvoiceRow[] = ((data ?? []) as unknown as Row[]).map((r) => ({
    ...r,
    provider: r.provider?.legal_name ?? '—',
    sansCompte: !r.provider?.user_id,
    apportePar: r.apporteur?.full_name ?? null,
  }))

  const par = (s: readonly string[]) => rows.filter((r) => s.includes(r.status))
  const courant = (onglet === 'diverses' ? 'diverses' : onglet && onglet in ONGLETS ? onglet : par(['sent']).length ? 'transmises' : 'validees') as
    | keyof typeof ONGLETS
    | 'diverses'

  const transmises = par(['sent'])
  const validees = par(['validated'])
  const aEnvoyer = validees.filter((r) => r.pennylane_status !== 'synced')
  const inbound = process.env.DEPOT_FACTURES_EMAIL ?? null

  // Arrivées par email sans qu'on sache de qui : elles attendent un manager.
  const brutes = (data ?? []) as unknown as Row[]
  const aRattacher = brutes
    .filter((r) => r.channel === 'email' && !r.inbound_match && r.status === 'sent')
    .map((r) => ({
      id: r.id,
      number: r.number,
      issue_date: r.issue_date,
      total_ttc: Number(r.total_ttc),
      inbound_from: r.inbound_from,
      fournisseur: r.provider?.legal_name ?? '—',
    }))

  const liste = courant === 'diverses' ? rows.filter((r) => r.kind === 'misc') : par(ONGLETS[courant].statuts)

  // Avant de valider, on regarde si la comptabilité porte déjà ce montant.
  const doublons = await chercherDoublons(
    liste.filter((r) => r.status === 'sent').map((r) => ({ id: r.id, provider: r.provider, total_ttc: Number(r.total_ttc), issue_date: r.issue_date }))
  )
  const gestes =
    courant === 'transmises'
      ? (['valider', 'pennylane', 'payer'] as const)
      : courant === 'validees' || courant === 'diverses'
        ? (['pennylane', 'payer'] as const)
        : ([] as const)

  return (
    <>
      {/* Ce qu'il faut faire maintenant, et ce que ça représente. Le reste
          du mois se lit en dessous ; ici on ne dit qu'une chose. */}
      <div className="mb-6 overflow-hidden rounded-xl border border-line bg-white">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line bg-cream-muted px-5 py-4">
          <div className="min-w-0">
            <p className="ds-eyebrow">Prochaine étape</p>
            <p className="mt-1 font-display text-lg text-navy">
              {transmises.length > 0
                ? `${transmises.length} facture${transmises.length > 1 ? 's' : ''} à vérifier et valider`
                : aEnvoyer.length > 0
                  ? `${aEnvoyer.length} facture${aEnvoyer.length > 1 ? 's' : ''} à envoyer en comptabilité`
                  : 'Rien en attente de votre part'}
            </p>
            <p className="mt-0.5 text-sm text-muted">
              {transmises.length > 0
                ? `${money(transmises.reduce((s, r) => s + Number(r.total_ttc), 0))} — ouvrez-les si besoin, cochez, puis validez.`
                : aEnvoyer.length > 0
                  ? `${money(aEnvoyer.reduce((s, r) => s + Number(r.total_ttc), 0))} — cochez-les et envoyez-les dans Pennylane.`
                  : 'Les paiements remontent tout seuls depuis Pennylane.'}
            </p>
          </div>
          <form action={actualiserPaiements}>
            <SubmitButton variant="secondary" pendingLabel="Relecture…">
              <RefreshCw size={15} />
              Actualiser les paiements
            </SubmitButton>
          </form>
        </div>
        <div className="grid divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {[
            ['1 — Reçues, à valider', transmises],
            ['2 — Validées, à passer en compta', aEnvoyer],
            ['Reste à régler', rows.filter((r) => ['sent', 'validated'].includes(r.status))],
          ].map(([label, lot]) => (
            <div key={label as string} className="px-5 py-3">
              <p className="text-xs uppercase tracking-wide text-muted">{label as string}</p>
              <p className="font-display mt-1 text-xl font-semibold text-navy">
                {money((lot as AdminInvoiceRow[]).reduce((s, r) => s + Number(r.total_ttc), 0))}
              </p>
              <p className="text-xs text-muted">
                {(lot as AdminInvoiceRow[]).length} facture{(lot as AdminInvoiceRow[]).length > 1 ? 's' : ''}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {(
          [
            ['transmises', '1 — Reçues', transmises.length],
            ['validees', '2 — Validées', aEnvoyer.length],
            ['payees', '3 — Payées', 0],
            ['diverses', 'Factures fournisseurs', 0],
            ['attente', 'En attente de leur PDF', par(['issued']).length],
          ] as const
        ).map(([cle, label, compte]) => (
          <Link
            key={cle}
            href={`/remunerations?vue=factures&onglet=${cle}`}
            className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
              courant === cle
                ? 'border-navy bg-navy font-medium text-cream'
                : 'border-line bg-white text-navy/70 hover:bg-cream-muted'
            }`}
          >
            {label}
            {compte > 0 && <span className="ml-1.5 text-xs opacity-80">{compte}</span>}
          </Link>
        ))}
      </div>

      <ARattacher factures={aRattacher} managers={managers} />

      {courant === 'diverses' && (
        <Card className="mb-6 p-5">
          <MiscInvoiceUpload categories={cats ?? []} inboundAddress={inbound} />
        </Card>
      )}

      {liste.length === 0 ? (
        <EmptyState title="Aucune facture ici" />
      ) : (
        <InvoiceTable rows={liste} gestes={[...gestes]} doublons={Object.fromEntries(doublons)} />
      )}
    </>
  )
}
