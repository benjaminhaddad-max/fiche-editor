import { FileText } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Page'
import { CONTRACT_STATUS_LABEL, contractRate, contractTitle, type ContractRow } from '@/lib/contracts'
import { formatDate, formatPeriod, money } from '@/lib/format'
import { POLE_LABEL } from '@/lib/labels'

const STYLE: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  draft: 'bg-cream-deep text-stone ring-line',
  ended: 'bg-navy/5 text-navy-soft ring-navy/15',
  cancelled: 'bg-red-50 text-red-700 ring-red-200',
}

/** Un contrat, lisible par le prestataire comme par l'administration. */
export function ContractCard({
  c,
  showProvider,
  footer,
}: {
  c: ContractRow
  showProvider?: boolean
  footer?: React.ReactNode
}) {
  const echeances = [...(c.instalments ?? [])].sort((a, b) => a.due_date.localeCompare(b.due_date))
  const ouvert = echeances.filter((e) => e.mission_id).reduce((s, e) => s + Number(e.amount_ht), 0)
  const total = Number(c.total_ht)
  const pct = total > 0 ? Math.round((ouvert / total) * 100) : 0

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-gold/15 text-gold-dark ring-gold/30">{POLE_LABEL[c.contract_type]}</Badge>
            <Badge className={STYLE[c.status] ?? STYLE.draft}>{CONTRACT_STATUS_LABEL[c.status] ?? c.status}</Badge>
          </div>
          <p className="mt-2 font-semibold text-navy">
            {showProvider && c.provider ? `${c.provider.legal_name} — ` : ''}
            {contractTitle(c)}
          </p>
          <p className="mt-0.5 text-sm text-navy/70">
            {c.academic_year ? `Année ${c.academic_year}` : formatPeriod(c.start_date, c.end_date)}
            {c.manager ? ` · suivi par ${c.manager.full_name}` : ''}
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-xl font-semibold text-navy">{total > 0 ? money(total) : '—'}</p>
          <p className="text-xs text-muted">{contractRate(c)}</p>
        </div>
      </div>

      {c.conditions && <p className="mt-3 whitespace-pre-line text-sm text-navy/80">{c.conditions}</p>}

      {c.document_path && (
        <a
          href={`/api/contrats/${c.id}/pdf`}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-gold-dark hover:underline"
        >
          <FileText size={15} />
          Voir le contrat signé (PDF)
        </a>
      )}

      {echeances.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-cream-deep">
            <div className="h-full rounded-full bg-navy" style={{ width: `${pct}%` }} />
          </div>
          <ul className="grid gap-1.5 text-xs sm:grid-cols-2">
            {echeances.map((e) => (
              <li key={e.id} className="flex justify-between gap-3 rounded-md bg-cream-muted px-2.5 py-1.5">
                <span className={e.mission_id ? 'text-navy' : 'text-navy/60'}>
                  {formatDate(e.due_date)} · {e.label}
                </span>
                <span className="font-medium text-navy">
                  {money(e.amount_ht)} {e.mission_id ? '✓' : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {footer && <div className="mt-4 border-t border-line pt-3">{footer}</div>}
    </Card>
  )
}
