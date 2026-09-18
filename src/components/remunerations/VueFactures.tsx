import Link from 'next/link'
import { RefreshCw } from 'lucide-react'
import { InvoiceTable, type AdminInvoiceRow } from '@/components/admin/InvoiceTable'
import { MiscInvoiceUpload } from '@/components/admin/MiscInvoiceUpload'
import { Card, EmptyState, StatTile } from '@/components/ui/Page'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { actualiserPaiements } from '@/app/(app)/admin/factures/actions'
import { money } from '@/lib/format'
import { createServerSupabase } from '@/lib/supabase/server'
import type { AiCheck, InvoiceStatus, PennylaneStatus } from '@/lib/types'

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
  ai_check: AiCheck | null
  provider: { legal_name: string; user_id: string | null } | null
  apporteur: { full_name: string } | null
}

const ONGLETS = {
  transmises: { label: 'Transmises', statuts: ['sent'] },
  validees: { label: 'Validées', statuts: ['validated'] },
  payees: { label: 'Payées', statuts: ['paid'] },
  attente: { label: 'En attente du PDF', statuts: ['issued'] },
} as const

/** Les factures reçues, à valider puis à envoyer dans Pennylane. */
export async function VueFactures({ onglet }: { onglet?: string }) {
  const supabase = await createServerSupabase()

  const [{ data }, { data: cats }] = await Promise.all([
    supabase
      .from('inv_invoices')
      .select(
        `id, number, status, kind, issue_date, subtotal_ht, total_ttc, pennylane_status, pennylane_error,
         pdf_source, channel, ai_check,
         provider:inv_providers(legal_name, user_id),
         apporteur:inv_users!inv_invoices_submitted_by_fkey(full_name)`
      )
      .order('issue_date', { ascending: false }),
    supabase.from('inv_categories').select('id, name').eq('is_active', true).order('sort_order'),
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

  const liste = courant === 'diverses' ? rows.filter((r) => r.kind === 'misc') : par(ONGLETS[courant].statuts)
  const gestes =
    courant === 'transmises'
      ? (['valider', 'pennylane', 'payer'] as const)
      : courant === 'validees' || courant === 'diverses'
        ? (['pennylane', 'payer'] as const)
        : ([] as const)

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Les factures transmises arrivent ici. Validez-les, puis envoyez-les dans Pennylane. Ce qui y est payé
          revient automatiquement.
        </p>
        <form action={actualiserPaiements}>
          <SubmitButton variant="secondary" size="sm" pendingLabel="Relecture…">
            <RefreshCw size={14} />
            Actualiser depuis Pennylane
          </SubmitButton>
        </form>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile label="À valider" value={String(transmises.length)} sub={money(transmises.reduce((s, r) => s + Number(r.total_ttc), 0))} accent="amber" />
        <StatTile label="Validées, pas encore dans Pennylane" value={String(aEnvoyer.length)} sub={money(aEnvoyer.reduce((s, r) => s + Number(r.total_ttc), 0))} accent="brand" />
        <StatTile
          label="Restant à régler"
          value={money(rows.filter((r) => ['sent', 'validated'].includes(r.status)).reduce((s, r) => s + Number(r.total_ttc), 0))}
        />
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {(
          [
            ['transmises', 'Transmises', transmises.length],
            ['validees', 'Validées', aEnvoyer.length],
            ['diverses', 'Factures diverses', 0],
            ['payees', 'Payées', 0],
            ['attente', 'En attente du PDF', par(['issued']).length],
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

      {courant === 'diverses' && (
        <Card className="mb-6 p-5">
          <MiscInvoiceUpload categories={cats ?? []} inboundAddress={inbound} />
        </Card>
      )}

      {liste.length === 0 ? (
        <EmptyState title="Aucune facture ici" />
      ) : (
        <InvoiceTable rows={liste} gestes={[...gestes]} />
      )}
    </>
  )
}
