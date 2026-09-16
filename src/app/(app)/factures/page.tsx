import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertTriangle, CheckCircle2, Download, FileUp, MessageSquare } from 'lucide-react'
import { CalendrierMois } from '@/components/cycle/CalendrierMois'
import { InvoiceStatusBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, EmptyState, PageHeader } from '@/components/ui/Page'
import { requireProvider } from '@/lib/auth'
import { cycleForMonth } from '@/lib/cycle'
import { formatDate, formatDateLong, money } from '@/lib/format'
import { POLE_LABEL } from '@/lib/labels'
import { createServerSupabase } from '@/lib/supabase/server'
import { isSalaried, type Invoice, type Pole } from '@/lib/types'

interface Ligne {
  id: string
  detail: string
  total_ht: number
  status: string
  category: { pole: Pole } | null
  manager: { full_name: string } | null
}

export default async function FacturationPage() {
  const { provider } = await requireProvider()
  if (isSalaried(provider.employment_type)) redirect('/missions')
  const supabase = await createServerSupabase()

  const [{ data: invoiceData }, { data: bordereaux }, { count: horsBordereau }] = await Promise.all([
    supabase.from('inv_invoices').select('*').eq('provider_id', provider.id).order('issue_date', { ascending: false }),
    supabase
      .from('inv_statements')
      .select('id, cycle_month, total_ht, invoice_deadline, payment_start, invoice_id, status')
      .eq('provider_id', provider.id)
      .is('invoice_id', null)
      .order('cycle_month', { ascending: false })
      .limit(3),
    supabase
      .from('inv_missions')
      .select('id', { count: 'exact', head: true })
      .eq('provider_id', provider.id)
      .eq('status', 'approved')
      .is('invoice_id', null)
      .is('statement_id', null),
  ])

  const invoices = (invoiceData ?? []) as Invoice[]
  const ouverts = bordereaux ?? []

  const lignesParBordereau = new Map<string, Ligne[]>()
  if (ouverts.length) {
    const { data } = await supabase
      .from('inv_missions')
      .select(
        `id, detail, total_ht, status, statement_id,
         category:inv_categories(pole),
         manager:inv_users!inv_missions_manager_id_fkey(full_name)`
      )
      .in('statement_id', ouverts.map((b) => b.id))
      .eq('status', 'approved')
    for (const l of (data ?? []) as unknown as (Ligne & { statement_id: string })[]) {
      lignesParBordereau.set(l.statement_id, [...(lignesParBordereau.get(l.statement_id) ?? []), l])
    }
  }

  return (
    <>
      <PageHeader
        title="Facturation"
        description="Le 1er de chaque mois, votre bordereau réunit toutes vos prestations validées, tous pôles confondus. Vous avez 2 jours pour transmettre la facture."
      />

      <CalendrierMois pour="prestataire" />

      {ouverts.map((b) => {
        const cycle = cycleForMonth(b.cycle_month)
        const lignes = lignesParBordereau.get(b.id) ?? []
        const total = lignes.reduce((s, l) => s + Number(l.total_ht), 0)
        const parPole = new Map<Pole, number>()
        for (const l of lignes) {
          const p = l.category?.pole ?? 'autres'
          parPole.set(p, (parPole.get(p) ?? 0) + Number(l.total_ht))
        }
        return (
          <Card key={b.id} className="mb-6 overflow-hidden border-gold/50">
            <div className="flex flex-wrap items-start justify-between gap-4 bg-gold/10 px-5 py-4">
              <div>
                <p className="ds-eyebrow text-gold-dark">Bordereau de {cycle.label}</p>
                <p className="font-display mt-1 text-2xl font-semibold text-navy">{money(total)} HT</p>
                <p className="mt-1 text-sm text-navy/80">
                  Facture à transmettre <strong>au plus tard le {formatDateLong(b.invoice_deadline)}</strong> ·
                  paiement le {formatDateLong(b.payment_start)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href={`/factures/nouvelle?bordereau=${b.id}`}>
                  <Button>
                    <CheckCircle2 size={16} />
                    Générer ma facture
                  </Button>
                </Link>
                <Link href={`/factures/nouvelle?bordereau=${b.id}&mode=uploaded`}>
                  <Button variant="secondary">
                    <FileUp size={16} />
                    Déposer la mienne
                  </Button>
                </Link>
                <Link
                  href={`/messages?nouveau&bordereau=${b.id}&objet=${encodeURIComponent(`Bordereau de ${cycle.label}`)}`}
                >
                  <Button variant="ghost">
                    <MessageSquare size={16} />
                    Signaler un problème
                  </Button>
                </Link>
              </div>
            </div>
            <div className="grid gap-x-8 gap-y-1 border-b border-line px-5 py-3 text-sm sm:grid-cols-3">
              {[...parPole.entries()].map(([p, m]) => (
                <p key={p} className="flex justify-between gap-3">
                  <span className="text-navy/70">{POLE_LABEL[p]}</span>
                  <span className="font-medium text-navy">{money(m)}</span>
                </p>
              ))}
            </div>
            <ul className="divide-y divide-line/60">
              {lignes.map((l) => (
                <li key={l.id} className="flex items-start justify-between gap-4 px-5 py-2.5 text-sm">
                  <span className="text-navy">
                    {l.detail}
                    <span className="ml-2 text-xs text-muted">{l.manager?.full_name}</span>
                  </span>
                  <span className="shrink-0 font-medium text-navy">{money(l.total_ht)}</span>
                </li>
              ))}
            </ul>
          </Card>
        )
      })}

      {(horsBordereau ?? 0) > 0 && ouverts.length === 0 && (
        <p className="mb-6 rounded-lg border border-line bg-white px-4 py-3 text-sm text-navy/80">
          {horsBordereau} prestation{(horsBordereau ?? 0) > 1 ? 's' : ''} validée{(horsBordereau ?? 0) > 1 ? 's' : ''} rejoindr
          {(horsBordereau ?? 0) > 1 ? 'ont' : 'a'} votre prochain bordereau.{' '}
          <Link href="/factures/nouvelle" className="font-medium text-gold-dark hover:underline">
            Facturer sans attendre
          </Link>
        </p>
      )}

      <h2 className="mb-3 text-sm font-semibold text-navy">Mes factures</h2>
      {invoices.length === 0 ? (
        <EmptyState title="Aucune facture" description="Vos factures apparaîtront ici." />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-cream-muted text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Numéro</th>
                  <th className="px-4 py-3 font-medium">Émise le</th>
                  <th className="px-4 py-3 text-right font-medium">Total TTC</th>
                  <th className="px-4 py-3 font-medium">Statut</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-cream-muted">
                    <td className="whitespace-nowrap px-4 py-3">
                      <Link href={`/factures/${inv.id}`} className="font-medium text-gold-dark hover:underline">
                        {inv.number}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-navy/70">{formatDate(inv.issue_date)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-navy">
                      {money(inv.total_ttc)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <InvoiceStatusBadge status={inv.status} />
                        {inv.ai_check?.matches === false && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
                            <AlertTriangle size={13} />
                            Montant différent
                          </span>
                        )}
                        {inv.status === 'issued' && (
                          <Link href={`/factures/${inv.id}`} className="text-xs font-medium text-gold-dark hover:underline">
                            Déposer mon PDF →
                          </Link>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <a
                        href={`/api/factures/${inv.id}/pdf`}
                        target="_blank"
                        rel="noreferrer"
                        title="Télécharger le PDF"
                        className="inline-flex rounded p-1.5 text-muted transition-colors hover:bg-cream-deep hover:text-navy"
                      >
                        <Download size={15} />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  )
}
