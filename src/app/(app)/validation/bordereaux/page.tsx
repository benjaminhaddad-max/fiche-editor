import { CalendarClock } from 'lucide-react'
import { Card, EmptyState, PageHeader, StatTile } from '@/components/ui/Page'
import { ArbitrageBordereau, type BordereauAArbitrer } from '@/components/bordereau/ArbitrageBordereau'
import { requireRole } from '@/lib/auth'
import { cycleForDate } from '@/lib/cycle'
import { formatDate, money } from '@/lib/format'
import { createServerSupabase } from '@/lib/supabase/server'
import { cloreBordereau, relancer } from './actions'

interface LigneRow {
  id: string
  detail: string
  total_ht: number
  status: string
  origin: string
  manager_id: string
  statement_id: string | null
}

export default async function BordereauxAValiderPage() {
  const user = await requireRole('manager', 'admin')
  const supabase = await createServerSupabase()
  const cycle = cycleForDate(new Date())

  const { data: bordereaux } = await supabase
    .from('inv_statements')
    .select('*, provider:inv_providers(legal_name)')
    .in('status', ['sent', 'contested', 'accepted'])
    .order('cycle_month', { ascending: false })

  const ids = (bordereaux ?? []).map((b) => b.id)
  const { data: lignesData } = ids.length
    ? await supabase
        .from('inv_missions')
        .select('id, detail, total_ht, status, origin, manager_id, statement_id')
        .in('statement_id', ids)
    : { data: [] }

  const lignes = (lignesData ?? []) as LigneRow[]

  // Un manager ne voit que les bordereaux où il a des lignes : c'est sa part
  // du travail, pas celle des autres.
  const visibles = (bordereaux ?? [])
    .map((b) => {
      const siennes = lignes.filter(
        (l) => l.statement_id === b.id && (user.role === 'admin' || l.manager_id === user.id)
      )
      return { b, siennes }
    })
    .filter(({ siennes }) => siennes.length > 0)

  const aArbitrer = visibles.filter(({ b }) => b.status !== 'accepted')
  const clos = visibles.filter(({ b }) => b.status === 'accepted')
  const signales = aArbitrer.filter(({ b }) => b.provider_comment)
  const ajouts = visibles.reduce(
    (n, { siennes }) => n + siennes.filter((l) => l.origin === 'provider').length,
    0
  )

  const enSemaineDeVerification =
    new Date().toISOString().slice(0, 10) >= cycle.checkStart &&
    new Date().toISOString().slice(0, 10) <= cycle.invoiceDeadline

  const versModele = ({ b, siennes }: (typeof visibles)[number]): BordereauAArbitrer => ({
    id: b.id,
    cycle_month: b.cycle_month,
    provider: b.provider?.legal_name ?? '—',
    total_ht: Number(b.total_ht),
    invoice_deadline: b.invoice_deadline,
    invoice_expected_at: b.invoice_expected_at,
    provider_comment: b.provider_comment,
    status: b.status,
    reminder_count: b.reminder_count ?? 0,
    lignes: siennes.map((l) => ({
      id: l.id,
      detail: l.detail,
      total_ht: Number(l.total_ht),
      status: l.status,
      origin: l.origin,
    })),
  })

  return (
    <>
      <PageHeader
        title="Bordereaux de mes prestataires"
        description="Vérifiez leurs retours, tranchez, puis autorisez la facturation."
      />

      <Card className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3 text-sm">
        <span className="flex items-center gap-2 font-medium text-navy/80">
          <CalendarClock size={15} />
          {enSemaineDeVerification ? 'Semaine de vérification en cours' : 'Hors semaine de vérification'}
        </span>
        <span className="text-muted">
          Saisie jusqu’au {formatDate(cycle.periodEnd)} · bordereaux le {formatDate(cycle.statementDate)} ·
          factures avant le {formatDate(cycle.invoiceDeadline)} · paiement dès le{' '}
          {formatDate(cycle.paymentStart)}
        </span>
      </Card>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile label="À arbitrer" value={String(aArbitrer.length)} accent="amber" />
        <StatTile label="Problèmes signalés" value={String(signales.length)} accent={signales.length ? 'amber' : 'slate'} />
        <StatTile
          label="Ajouts des prestataires"
          value={String(ajouts)}
          sub="à regarder avant de clore"
        />
      </div>

      {aArbitrer.length === 0 && clos.length === 0 ? (
        <EmptyState
          title="Aucun bordereau vous concernant"
          description="Vous verrez ici les bordereaux des prestataires dont vous avez commandé des prestations."
        />
      ) : (
        <div className="flex flex-col gap-5">
          {aArbitrer.map((v) => (
            <ArbitrageBordereau
              key={v.b.id}
              bordereau={versModele(v)}
              clore={cloreBordereau}
              relancer={relancer}
            />
          ))}

          {clos.length > 0 && (
            <>
              <h2 className="mt-4 text-sm font-semibold text-navy">
                Clos — en attente de leur facture ({money(clos.reduce((s, v) => s + Number(v.b.total_ht), 0))})
              </h2>
              {clos.map((v) => (
                <ArbitrageBordereau
                  key={v.b.id}
                  bordereau={versModele(v)}
                  clore={cloreBordereau}
                  relancer={relancer}
                />
              ))}
            </>
          )}
        </div>
      )}
    </>
  )
}
