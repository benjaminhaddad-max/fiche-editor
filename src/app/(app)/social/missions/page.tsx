import { ongletsSocial } from '@/components/social/onglets'
import { FlecheMois } from '@/components/ui/FlecheMois'
import { Card, EmptyState, PageHeader } from '@/components/ui/Page'
import { formatDate, money } from '@/lib/format'
import { estAcquise } from '@/lib/paie'
import { moisPrecedentDe, moisSuivant } from '@/lib/social/calendrier'
import { tableauDuMois } from '@/lib/social/donnees'
import { requireEquipeSocial } from '@/lib/social/parametres'

const libelleMois = (m: string) =>
  new Date(`${m}-15T12:00:00Z`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' })

/**
 * Les missions des vacataires, telles que leurs managers les ont validées.
 * Elles se déclarent toujours dans « Prestations » ; ici on les lit, et le
 * net validé part dans le fichier Silae avec le reste du mois. Plus d'envoi
 * séparé : le même clic « Envoyer à Net Paye » les ferme.
 */
export default async function MissionsVacatairesPage({ searchParams }: { searchParams: Promise<{ mois?: string }> }) {
  const user = await requireEquipeSocial()
  const { mois: m } = await searchParams
  const mois = m && /^\d{4}-\d{2}$/.test(m) ? m : moisPrecedentDe(new Date().toISOString().slice(0, 7))
  const lignes = (await tableauDuMois(mois, 'vacataires')).filter((l) => l.missions.length || l.saisie.missions_total)

  return (
    <>
      <PageHeader
        title="Espace Social"
        description="Les missions des vacataires : le net validé par les managers, qui part en net vers Silae."
        tabs={ongletsSocial(user.role === 'admin')}
        currentTab="missions"
      />
      <div className="mb-5 flex items-center gap-3 text-sm">
        <FlecheMois href={`/social/missions?mois=${moisPrecedentDe(mois)}`} sens="prec" />
        <p className="font-semibold capitalize text-navy">{libelleMois(mois)}</p>
        <FlecheMois href={`/social/missions?mois=${moisSuivant(mois)}`} sens="suiv" />
      </div>
      {!lignes.length ? (
        <EmptyState title="Aucune mission en attente d’envoi" description="Les missions déjà transmises n’apparaissent plus ici." />
      ) : (
        <div className="flex flex-col gap-4">
          {lignes.map((l) => (
            <Card key={l.salarie.providerId} className="p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold text-navy">{l.salarie.nom}</p>
                <p className="text-sm">
                  Net validé : <strong>{money(l.netMissions)}</strong>
                  {l.missionsEnAttente > 0 && <span className="ml-2 text-xs text-amber-700">{l.missionsEnAttente} en attente du manager</span>}
                </p>
              </div>
              <ul className="mt-2 divide-y divide-line/60 text-sm">
                {l.missions.map((x) => (
                  <li key={x.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                    <span className="text-navy/80">
                      {formatDate(x.date)} — {x.detail} <span className="text-xs text-muted">· {x.categorie} · {x.manager}</span>
                    </span>
                    <span className={estAcquise(x.status) ? '' : 'text-amber-700'}>
                      {money(x.total)} net{x.abattement > 0 ? ` (abattement ${x.abattement} %)` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
