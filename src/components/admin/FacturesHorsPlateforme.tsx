import { Check, ExternalLink, Undo2 } from 'lucide-react'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { reglerHorsPlateforme } from '@/app/(app)/admin/factures/actions'
import { Card } from '@/components/ui/Page'
import { formatDate, money } from '@/lib/format'
import type { FactureHorsPlateforme } from '@/lib/invoice/hors-plateforme'

/**
 * Ce que la société doit par ailleurs : loyer, fournisseurs, abonnements,
 * sociétés de portage. Ces factures n'ont pas de bordereau et ne passent
 * pas par la validation d'un manager — on les montre pour qu'une seule
 * page dise ce qui reste à payer.
 */
export function FacturesHorsPlateforme({ factures }: { factures: FactureHorsPlateforme[] }) {
  if (factures.length === 0) return null
  const dues = factures.filter((f) => !f.reglee)

  return (
    <Card className="mb-6 overflow-hidden">
      <div className="border-b border-line bg-cream-muted px-5 py-4">
        <p className="text-sm font-semibold text-navy">Reçues directement en comptabilité</p>
        <p className="mt-0.5 text-xs text-muted">
          {dues.length} facture{dues.length > 1 ? 's' : ''} à régler —{' '}
          <strong className="font-semibold text-navy">{money(dues.reduce((s, f) => s + f.montant, 0))}</strong>.
          Elles ne sont jamais passées par la plateforme : loyer, fournisseurs, abonnements, sociétés de
          portage. Le virement part de votre banque ; le bouton met la comptabilité d’accord avec lui.
        </p>
      </div>
      <div className="max-h-[32rem] overflow-y-auto">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-line/60">
            {factures.map((f) => (
              <tr key={f.id} className={f.reglee ? 'text-navy/45' : undefined}>
                <td className="px-5 py-2.5">
                  <p className={f.reglee ? '' : 'font-medium text-navy'}>{f.fournisseur}</p>
                  <p className="text-xs text-muted">
                    {formatDate(f.date)}
                    {f.numero ? ` · ${f.numero}` : ''}
                  </p>
                </td>
                <td className="whitespace-nowrap px-5 py-2.5 text-right font-semibold">{money(f.montant)}</td>
                <td className="whitespace-nowrap px-5 py-2.5 text-xs">
                  {f.reglee ? (
                    <span className="text-emerald-700">réglée</span>
                  ) : (
                    <span className="text-amber-800">à régler</span>
                  )}
                </td>
                <td className="px-5 py-2.5">
                  <form action={reglerHorsPlateforme}>
                    <input type="hidden" name="pennylane_id" value={f.id} />
                    <input type="hidden" name="statut" value={f.reglee ? 'to_be_paid' : 'paid'} />
                    <SubmitButton size="sm" variant={f.reglee ? 'ghost' : 'secondary'} pendingLabel="…">
                      {f.reglee ? (
                        <>
                          <Undo2 size={13} />
                          Rouvrir
                        </>
                      ) : (
                        <>
                          <Check size={13} />
                          Marquer réglée
                        </>
                      )}
                    </SubmitButton>
                  </form>
                </td>
                <td className="px-5 py-2.5 text-right">
                  {f.pdf && (
                    <a
                      href={f.pdf}
                      target="_blank"
                      rel="noreferrer"
                      title="Ouvrir la facture"
                      className="inline-flex rounded p-1.5 text-muted hover:bg-cream-deep hover:text-navy"
                    >
                      <ExternalLink size={15} />
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
