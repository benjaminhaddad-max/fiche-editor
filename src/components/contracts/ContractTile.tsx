import Link from 'next/link'
import { CheckCircle2, Clock, FileText } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { CONTRACT_STATUS_LABEL, contractRate, contractTitle, type ContractRow } from '@/lib/contracts'
import { formatDate, formatPeriod, money } from '@/lib/format'
import { POLE_LABEL } from '@/lib/labels'

const STATUT: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  draft: 'bg-cream-deep text-stone ring-line',
  ended: 'bg-navy/5 text-navy-soft ring-navy/15',
  cancelled: 'bg-red-50 text-red-700 ring-red-200',
}

/**
 * Une vignette courte : qui, quoi, combien, où en est la signature. Le
 * détail — échéancier, articles, dépôt du PDF — vit sur la page du contrat :
 * une liste sert à balayer, pas à tout lire.
 */
export function ContractTile({ c, showProvider }: { c: ContractRow; showProvider?: boolean }) {
  const echeances = c.instalments ?? []
  const ouvertes = echeances.filter((e) => e.mission_id).length
  const total = Number(c.total_ht)

  return (
    <Link
      href={`/admin/contrats/${c.id}`}
      className="flex flex-col gap-2 rounded-xl border border-line bg-white p-4 transition-colors hover:border-gold/50 hover:bg-cream-muted"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge className="bg-gold/15 text-gold-dark ring-gold/30">{POLE_LABEL[c.contract_type]}</Badge>
          {c.status !== 'active' && (
            <Badge className={STATUT[c.status] ?? STATUT.draft}>{CONTRACT_STATUS_LABEL[c.status] ?? c.status}</Badge>
          )}
        </div>
        <span className="whitespace-nowrap text-right">
          <span className="font-display block text-base font-semibold text-navy">
            {total > 0 ? money(total) : c.rate_amount ? money(c.rate_amount) : '—'}
          </span>
          <span className="text-[11px] text-muted">{contractRate(c)}</span>
        </span>
      </div>

      <div>
        <p className="text-sm font-semibold text-navy">
          {showProvider && c.provider ? c.provider.legal_name : contractTitle(c)}
        </p>
        <p className="mt-0.5 line-clamp-1 text-xs text-muted">
          {showProvider ? contractTitle(c) : c.academic_year ? `Année ${c.academic_year}` : formatPeriod(c.start_date, c.end_date)}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
        {echeances.length > 0 && (
          <span>
            {ouvertes} / {echeances.length} échéances ouvertes
          </span>
        )}
        {c.monthly_auto && <span>forfait mensuel automatique</span>}
        {c.manager && <span>{c.manager.full_name}</span>}
        {c.signed_at ? (
          <span className="inline-flex items-center gap-1 text-emerald-700">
            <CheckCircle2 size={12} />
            signé le {formatDate(c.signed_at)}
          </span>
        ) : c.sent_at ? (
          <span className="inline-flex items-center gap-1 text-amber-700">
            <Clock size={12} />
            envoyé, en attente de signature
          </span>
        ) : c.document_path ? (
          <span className="inline-flex items-center gap-1">
            <FileText size={12} />
            document déposé
          </span>
        ) : (
          <span className="text-amber-700">pas de contrat signé</span>
        )}
      </div>
    </Link>
  )
}
