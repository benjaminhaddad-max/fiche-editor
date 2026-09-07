import Link from 'next/link'
import { Badge } from '@/components/ui/Badge'
import { Card, EmptyState, PageHeader } from '@/components/ui/Page'
import { requireProvider } from '@/lib/auth'
import { formatDate, formatPeriod, money } from '@/lib/format'
import { createServerSupabase } from '@/lib/supabase/server'

const ETAT: Record<string, { label: string; style: string }> = {
  draft: { label: 'En préparation', style: 'bg-cream-deep text-navy/70 ring-line' },
  sent: { label: 'À vérifier', style: 'bg-amber-50 text-amber-700 ring-amber-200' },
  contested: { label: 'Remarque en cours d’examen', style: 'bg-orange-50 text-orange-700 ring-orange-200' },
  accepted: { label: 'Accepté', style: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  invoiced: { label: 'Facturé', style: 'bg-indigo-50 text-indigo-700 ring-indigo-200' },
}

export default async function BordereauxPage() {
  const { provider } = await requireProvider()
  const supabase = await createServerSupabase()

  const { data } = await supabase
    .from('inv_statements')
    .select('*')
    .eq('provider_id', provider.id)
    .order('cycle_month', { ascending: false })

  const bordereaux = data ?? []

  return (
    <>
      <PageHeader
        title="Mes bordereaux"
        description="Le récapitulatif mensuel de vos prestations, à vérifier avant de facturer."
      />

      {bordereaux.length === 0 ? (
        <EmptyState
          title="Aucun bordereau pour l’instant"
          description="Vous en recevrez un chaque mois, une fois vos prestations vérifiées par Diploma Santé."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {bordereaux.map((b) => {
            const e = ETAT[b.status] ?? ETAT.draft
            return (
              <Link key={b.id} href={`/bordereaux/${b.id}`}>
                <Card className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4 transition-colors hover:bg-cream-muted">
                  <span className="font-semibold text-navy">{b.cycle_month}</span>
                  <span className="text-sm text-muted">
                    {formatPeriod(b.period_start, b.period_end)}
                  </span>
                  <Badge className={e.style}>{e.label}</Badge>
                  <span className="text-sm text-navy/70">
                    Facture avant le{' '}
                    {formatDate(b.invoice_expected_at ?? b.invoice_deadline)}
                  </span>
                  <span className="ml-auto font-semibold text-navy">
                    {money(b.total_ht)} HT
                  </span>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </>
  )
}
