import Link from 'next/link'
import { FileText } from 'lucide-react'
import { BulletinsUpload } from '@/components/admin/BulletinsUpload'
import { Card, EmptyState, StatTile } from '@/components/ui/Page'
import type { BillingCycle } from '@/lib/cycle'
import { money, round2 } from '@/lib/format'
import { EMPLOYMENT_LABEL } from '@/lib/labels'
import { remunerationsDuMois } from '@/lib/paie/remunerations'

/** Vue d'ensemble : ce que chaque personne coûte sur le mois. */
export async function VueMois({ cycle }: { cycle: BillingCycle }) {
  const lignes = await remunerationsDuMois(cycle)
  const total = (f: (l: (typeof lignes)[number]) => number) => round2(lignes.reduce((s, l) => s + f(l), 0))

  return (
    <>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile label="Facturé (indépendants)" value={money(total((l) => l.facture))} accent="brand" />
        <StatTile label="Variables transmis à la paie" value={money(total((l) => l.variables))} accent="amber" />
        <StatTile
          label="Coût employeur connu"
          value={money(total((l) => l.cout ?? 0))}
          sub={`${lignes.filter((l) => l.bulletin).length} bulletin(s) reçu(s)`}
        />
      </div>

      {lignes.length === 0 ? (
        <EmptyState title="Personne à rémunérer sur ce mois" />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-cream-muted text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Personne</th>
                  <th className="px-4 py-3 font-medium">Statut</th>
                  <th className="px-4 py-3 text-right font-medium">Facturé</th>
                  <th className="px-4 py-3 text-right font-medium">Variables</th>
                  <th className="px-4 py-3 text-right font-medium">Net</th>
                  <th className="px-4 py-3 text-right font-medium">Coût employeur</th>
                  <th className="px-4 py-3 font-medium">Bulletin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {lignes.map((l) => (
                  <tr key={l.providerId} className="hover:bg-cream-muted">
                    <td className="px-4 py-3">
                      <Link href={`/admin/prestataires/${l.providerId}`} className="font-medium text-navy hover:underline">
                        {l.nom}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">{EMPLOYMENT_LABEL[l.statut]}</td>
                    <td className="px-4 py-3 text-right text-navy/80">{l.facture ? money(l.facture) : '—'}</td>
                    <td className="px-4 py-3 text-right text-navy/80">{l.variables ? money(l.variables) : '—'}</td>
                    <td className="px-4 py-3 text-right text-navy/80">{l.net === null ? '—' : money(l.net)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-navy">{l.cout === null ? '—' : money(l.cout)}</td>
                    <td className="px-4 py-3">
                      {l.documentId ? (
                        <a
                          href={`/api/documents/${l.documentId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-gold-dark hover:underline"
                        >
                          <FileText size={13} />
                          Ouvrir
                        </a>
                      ) : l.statut === 'independant' ? (
                        <span className="text-xs text-muted">—</span>
                      ) : (
                        <span className="text-xs text-amber-700">pas encore reçu</span>
                      )}
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

/** Dépôt des bulletins du mois, et ce qui est déjà arrivé. */
export async function VueBulletins({ cycle }: { cycle: BillingCycle }) {
  const lignes = (await remunerationsDuMois(cycle)).filter((l) => l.statut !== 'independant')
  const recus = lignes.filter((l) => l.bulletin)
  const manquants = lignes.filter((l) => !l.bulletin)

  return (
    <>
      <Card className="mb-6 p-5">
        <BulletinsUpload adresse={process.env.DEPOT_FACTURES_EMAIL ?? null} />
      </Card>

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <StatTile label="Bulletins reçus" value={`${recus.length} / ${lignes.length}`} accent={manquants.length ? 'amber' : 'emerald'} />
        <StatTile label="Coût employeur du mois" value={money(round2(recus.reduce((s, l) => s + (l.cout ?? 0), 0)))} />
      </div>

      {manquants.length > 0 && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          En attente : {manquants.map((l) => l.nom).join(', ')}.
        </p>
      )}

      {recus.length > 0 && (
        <Card className="divide-y divide-line/60 overflow-hidden">
          {recus.map((l) => (
            <a
              key={l.providerId}
              href={`/api/documents/${l.documentId}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between gap-4 px-5 py-3 text-sm hover:bg-cream-muted"
            >
              <span className="font-medium text-navy">{l.nom}</span>
              <span className="text-navy/70">
                net {l.net === null ? '—' : money(l.net)} · coût {l.cout === null ? '—' : money(l.cout)}
              </span>
            </a>
          ))}
        </Card>
      )}
    </>
  )
}
