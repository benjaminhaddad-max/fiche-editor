import { InvoiceTable, type AdminInvoiceRow } from '@/components/admin/InvoiceTable'
import { MiscInvoiceUpload } from '@/components/admin/MiscInvoiceUpload'
import { Card, EmptyState, PageHeader, StatTile } from '@/components/ui/Page'
import { Tabs } from '@/components/ui/Tabs'
import { requireRole } from '@/lib/auth'
import { money } from '@/lib/format'
import { createServerSupabase } from '@/lib/supabase/server'
import type { AiCheck, InvoiceStatus, PennylaneStatus } from '@/lib/types'

export const maxDuration = 300

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

export default async function AdminFacturesPage({
  searchParams,
}: {
  searchParams: Promise<{ onglet?: string }>
}) {
  const { onglet } = await searchParams
  await requireRole('admin')
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
      <PageHeader
        title="Factures"
        description="Les factures transmises arrivent ici. Validez-les, puis envoyez-les dans Pennylane en un clic."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile label="À valider" value={String(transmises.length)} sub={money(transmises.reduce((s, r) => s + Number(r.total_ttc), 0))} accent="amber" />
        <StatTile label="Validées, pas encore dans Pennylane" value={String(aEnvoyer.length)} sub={money(aEnvoyer.reduce((s, r) => s + Number(r.total_ttc), 0))} accent="brand" />
        <StatTile
          label="Restant à régler"
          value={money(rows.filter((r) => ['sent', 'validated'].includes(r.status)).reduce((s, r) => s + Number(r.total_ttc), 0))}
        />
      </div>

      <Tabs
        current={courant}
        items={[
          { key: 'transmises', label: 'Transmises', href: '/admin/factures?onglet=transmises', count: transmises.length },
          { key: 'validees', label: 'Validées', href: '/admin/factures?onglet=validees', count: aEnvoyer.length },
          { key: 'diverses', label: 'Factures diverses', href: '/admin/factures?onglet=diverses' },
          { key: 'payees', label: 'Payées', href: '/admin/factures?onglet=payees' },
          { key: 'attente', label: 'En attente du PDF', href: '/admin/factures?onglet=attente', count: par(['issued']).length },
        ]}
      />

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
