import Link from 'next/link'
import { MissionStatusBadge } from '@/components/ui/Badge'
import { Card, EmptyState, StatTile } from '@/components/ui/Page'
import type { BillingCycle } from '@/lib/cycle'
import { formatDate, money, round2 } from '@/lib/format'
import { EMPLOYMENT_LABEL } from '@/lib/labels'
import { estAcquise, lignesPaie } from '@/lib/paie'
import type { MissionStatus } from '@/lib/types'

/**
 * Ce que les salariés vont toucher ce mois-ci, côté manager.
 *
 * Un manager voyait les éléments variables — heures supplémentaires,
 * congés, transport — mais jamais les montants : ceux-là ne vivaient que
 * dans l'envoi au social, réservé à l'administration. Il savait donc ce
 * qu'il avait validé pour ses indépendants, et rien pour ses vacataires,
 * alors que ce sont les mêmes prestations. Shirel a demandé à les voir :
 * « dans la partie paie, tu peux me mettre les salariés aussi ? »
 *
 * La vue suit le périmètre de l'onglet, qui montre déjà les éléments
 * variables de toute l'école : scoper les montants aux seules lignes qu'on
 * a validées soi-même donnerait les congés d'une personne sans ses heures,
 * ce qui ne se relit pas. Qui a validé quoi reste écrit sur chaque ligne.
 *
 * C'est une vue de lecture : valider se fait dans « À valider », envoyer à
 * la paie reste à l'administration.
 */
export async function VueSalairesManager({
  cycle,
  managerId,
}: {
  cycle: BillingCycle
  managerId: string
}) {
  const lignes = await lignesPaie(cycle.periodStart, cycle.periodEnd)

  const acquises = lignes.filter((l) => estAcquise(l.status))
  const attente = lignes.filter((l) => !estAcquise(l.status))
  const miennes = acquises.filter((l) => l.managerId === managerId)
  const total = round2(acquises.reduce((s, l) => s + l.total, 0))
  // Pour un salarié le montant porté est ce qu'il touche : un net. Le brut
  // n'apparaît que si quelqu'un a convenu d'un brut à part.
  const nature = (l: typeof lignes) => (l.some((x) => x.base === 'brut') ? 'brut' : 'net')

  const parPersonne = new Map<string, typeof lignes>()
  for (const l of lignes) parPersonne.set(l.personne, [...(parPersonne.get(l.personne) ?? []), l])

  if (lignes.length === 0) {
    return (
      <EmptyState
        title="Aucun salarié à payer ce mois-ci"
        description="Les vacataires, alternants et enseignants salariés apparaissent ici dès qu’une prestation est déclarée pour eux."
      />
    )
  }

  return (
    <>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile
          label={`Acquis (${nature(acquises)})`}
          value={money(total)}
          sub={`${acquises.length} ligne(s) · ${parPersonne.size} personne(s)`}
          accent="emerald"
        />
        <StatTile
          label="Que vous avez validé"
          value={money(round2(miennes.reduce((s, l) => s + l.total, 0)))}
          sub={`${miennes.length} ligne(s) sur ${acquises.length}`}
        />
        <StatTile
          label="En attente d’un manager"
          value={String(attente.length)}
          sub={attente.length ? 'non validées, elles ne partent pas à la paie' : 'rien ne traîne'}
          accent={attente.length ? 'amber' : 'slate'}
        />
      </div>

      {attente.length > 0 && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {attente.length} ligne(s) attendent encore d’être validées : elles ne partiront pas sur les bulletins
          tant qu’elles le sont.{' '}
          <Link href="/validation" className="font-semibold underline">
            Voir ce qui vous revient
          </Link>
        </p>
      )}

      <div className="flex flex-col gap-4">
        {[...parPersonne.entries()].map(([personne, ses]) => {
          const acquis = ses.filter((l) => estAcquise(l.status))
          return (
            <Card key={personne} className="overflow-hidden">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-navy">{personne}</p>
                  <p className="text-xs text-muted">{EMPLOYMENT_LABEL[ses[0].statut]}</p>
                </div>
                <p className="font-display text-[18px] font-semibold text-navy">
                  {money(round2(acquis.reduce((s, l) => s + l.total, 0)))}
                  <span className="ml-1.5 text-xs font-normal text-muted">{nature(acquis)}</span>
                </p>
              </div>
              <table className="w-full text-left">
                <tbody>
                  {ses.map((l) => (
                    <tr key={l.id} className="border-t border-line first:border-t-0">
                      <td className="px-4 py-2 text-xs whitespace-nowrap text-navy/70">{formatDate(l.date)}</td>
                      <td className="px-3 py-2 text-xs text-navy">{l.detail}</td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap text-navy/55">{l.manager}</td>
                      <td className="px-3 py-2 text-right text-xs whitespace-nowrap text-navy/70">
                        {l.quantity} × {money(l.unit)}
                      </td>
                      <td className="px-3 py-2 text-right text-xs font-medium whitespace-nowrap text-navy">
                        {money(l.total)}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <MissionStatusBadge status={l.status as MissionStatus} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )
        })}
      </div>
    </>
  )
}
