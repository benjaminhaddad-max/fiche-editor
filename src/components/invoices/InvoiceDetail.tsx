import { InvoiceStatusBadge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Page'
import { formatDate, formatPeriod, money } from '@/lib/format'
import { PRICING_UNIT } from '@/lib/labels'
import { COMPANY, type Invoice, type InvoiceLine } from '@/lib/types'

/** Rendu HTML de la facture, miroir du PDF. */
export function InvoiceDetail({
  invoice,
  lines,
}: {
  invoice: Invoice
  lines: InvoiceLine[]
}) {
  const issuer = invoice.issuer_snapshot
  const isFranchise = issuer.vat_regime === 'franchise'

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-6 border-b border-line p-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">
            Facture
          </p>
          <p className="mt-1 text-xl font-bold text-navy">{invoice.number}</p>
          <div className="mt-2">
            <InvoiceStatusBadge status={invoice.status} />
          </div>
        </div>
        <dl className="text-sm">
          <div className="flex gap-3">
            <dt className="w-28 text-muted">Émise le</dt>
            <dd className="font-medium">{formatDate(invoice.issue_date)}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-28 text-muted">Échéance</dt>
            <dd className="font-medium">{formatDate(invoice.due_date)}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-28 text-muted">Période</dt>
            <dd className="font-medium">
              {formatPeriod(invoice.period_start, invoice.period_end)}
            </dd>
          </div>
        </dl>
      </div>

      <div className="grid gap-6 border-b border-line p-6 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
            Émetteur
          </p>
          <p className="font-semibold text-navy">{issuer.legal_name}</p>
          <div className="mt-1 space-y-0.5 text-sm text-navy/70">
            {issuer.legal_form && <p>{issuer.legal_form}</p>}
            {issuer.address_line1 && <p>{issuer.address_line1}</p>}
            {issuer.address_line2 && <p>{issuer.address_line2}</p>}
            <p>
              {[issuer.postal_code, issuer.city].filter(Boolean).join(' ')}
              {issuer.country ? `, ${issuer.country}` : ''}
            </p>
            {issuer.siret && <p>SIRET : {issuer.siret}</p>}
            {issuer.vat_number && <p>TVA : {issuer.vat_number}</p>}
            <p>{issuer.email}</p>
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
            Facturé à
          </p>
          <p className="font-semibold text-navy">{COMPANY.name}</p>
          <div className="mt-1 space-y-0.5 text-sm text-navy/70">
            {COMPANY.address && <p>{COMPANY.address}</p>}
            <p>{[COMPANY.postalCode, COMPANY.city].filter(Boolean).join(' ')}</p>
            {COMPANY.siret && <p>SIRET : {COMPANY.siret}</p>}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-cream-muted text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-6 py-3 font-medium">Désignation</th>
              <th className="px-4 py-3 text-right font-medium">Quantité</th>
              <th className="px-4 py-3 text-right font-medium">PU HT</th>
              <th className="px-6 py-3 text-right font-medium">Total HT</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/60">
            {lines.map((l) => (
              <tr key={l.id} className="align-top">
                <td className="px-6 py-3">
                  <p className="font-medium text-navy">{l.description}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {l.category_name}
                    {l.period_label ? ` · ${l.period_label}` : ''}
                  </p>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-navy/70">
                  {Number(l.quantity)} {PRICING_UNIT[l.pricing_type]}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-navy/70">
                  {money(l.unit_amount_ht)}
                </td>
                <td className="whitespace-nowrap px-6 py-3 text-right font-semibold text-navy">
                  {money(l.total_ht)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end border-t border-line p-6">
        <dl className="flex w-full max-w-xs flex-col gap-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-navy/70">Total HT</dt>
            <dd className="font-medium">{money(invoice.subtotal_ht)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-navy/70">
              TVA {isFranchise ? '' : `(${Number(invoice.vat_rate)} %)`}
            </dt>
            <dd className="font-medium">
              {isFranchise ? 'Non applicable' : money(invoice.vat_amount)}
            </dd>
          </div>
          <div className="mt-1 flex justify-between border-t border-line pt-2">
            <dt className="font-semibold text-navy">Net à payer</dt>
            <dd className="text-base font-bold text-navy">
              {money(invoice.total_ttc)}
            </dd>
          </div>
        </dl>
      </div>

      {isFranchise && (
        <p className="border-t border-line px-6 py-4 text-xs text-muted">
          TVA non applicable, article 293 B du Code général des impôts.
        </p>
      )}
    </Card>
  )
}
