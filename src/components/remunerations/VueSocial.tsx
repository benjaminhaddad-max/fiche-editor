import { Badge, MissionStatusBadge } from '@/components/ui/Badge'
import { BoutonsSocial } from '@/components/remunerations/BoutonsSocial'
import { brand } from '@/lib/brand'
import { Card, EmptyState, StatTile } from '@/components/ui/Page'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { cloturerPaie } from '@/app/(app)/admin/paie/actions'
import type { BillingCycle } from '@/lib/cycle'
import { formatDate, money, round2 } from '@/lib/format'
import { EMPLOYMENT_LABEL } from '@/lib/labels'
import { estAcquise, lignesPaie } from '@/lib/paie'
import { createServiceClient } from '@/lib/supabase/service'
import type { MissionStatus } from '@/lib/types'

/** Ce qui part au service social ce mois-ci, et ce qui a déjà été envoyé. */
export async function VueSocial({ cycle }: { cycle: BillingCycle }) {
  const lignes = await lignesPaie(cycle.periodStart, cycle.periodEnd)
  const { data: lots } = await createServiceClient()
    .from('inv_payroll_batches')
    .select('id, total_ht, lines, created_at, auteur:inv_users!inv_payroll_batches_created_by_fkey(full_name)')
    .eq('cycle_month', cycle.month)
    .order('created_at')

  // Validée par son manager, c'est acquis : l'envoi ci-dessous est le seul
  // geste qui reste à l'administration.
  const pretes = lignes.filter((l) => estAcquise(l.status))
  const enCours = lignes.filter((l) => !estAcquise(l.status))
  // Pour un salarié, le montant porté est ce qu'il touche : un net. Le brut
  // ne subsiste que si quelqu'un a convenu d'un brut à part.
  const somme = (l: typeof lignes, base: 'brut' | 'net') =>
    round2(l.filter((x) => x.base === base).reduce((s, x) => s + x.total, 0))
  const nature = (l: typeof lignes) => (l.some((x) => x.base === 'brut') ? 'brut' : 'net')
  const parPersonne = new Map<string, typeof lignes>()
  for (const l of lignes) parPersonne.set(l.personne, [...(parPersonne.get(l.personne) ?? []), l])

  return (
    <>
      <BoutonsSocial
        mois={cycle.month}
        pretes={pretes.length}
        enAttente={enCours.length}
        contact={brand().payrollContact?.name ?? null}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile
          label={`Prêt à envoyer (${nature(pretes)})`}
          value={money(round2(pretes.reduce((s, l) => s + l.total, 0)))}
          sub={
            somme(pretes, 'brut') && somme(pretes, 'net')
              ? `dont ${money(somme(pretes, 'net'))} en net · ${pretes.length} ligne(s)`
              : `${pretes.length} ligne(s)`
          }
          accent="emerald"
        />
        <StatTile label="En attente d’un manager" value={String(enCours.length)} accent={enCours.length ? 'amber' : 'slate'} />
        <StatTile
          label="Déjà envoyé ce mois"
          value={money((lots ?? []).reduce((s, l) => s + Number(l.total_ht), 0))}
          sub={`${(lots ?? []).length} envoi(s)`}
        />
      </div>

      {lignes.length === 0 ? (
        <EmptyState
          title="Rien à envoyer pour ce mois"
          description="Les vacataires et alternants déclarent leurs prestations et bonus comme les autres ; ils apparaissent ici une fois saisis."
        />
      ) : (
        <form action={cloturerPaie} className="flex flex-col gap-4">
          <input type="hidden" name="mois" value={cycle.month} />
          {[...parPersonne.entries()].map(([personne, ls]) => (
            <Card key={personne} className="overflow-hidden">
              <div className="flex items-baseline justify-between border-b border-line bg-cream-muted px-5 py-3">
                <p className="text-sm font-semibold text-navy">
                  {personne} <span className="ml-2 font-normal text-muted">{EMPLOYMENT_LABEL[ls[0].statut]}</span>
                </p>
                <p className="text-right text-sm font-semibold text-navy">
                  {money(round2(ls.reduce((s, l) => s + l.total, 0)))} {nature(ls)}
                  {somme(ls, 'brut') > 0 && somme(ls, 'net') > 0 && (
                    <span className="mt-0.5 block text-xs font-medium text-gold-dark">
                      dont {money(somme(ls, 'net'))} en net
                    </span>
                  )}
                </p>
              </div>
              <ul className="divide-y divide-line/60">
                {ls.map((l) => (
                  <li key={l.id} className="flex items-start justify-between gap-4 px-5 py-2.5 text-sm">
                    <label className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        name="mission_id"
                        value={l.id}
                        defaultChecked={estAcquise(l.status)}
                        disabled={!estAcquise(l.status)}
                        className="mt-0.5 h-4 w-4 accent-navy"
                      />
                      <span>
                        <span className="text-navy">
                          {l.kind === 'bonus' && <Badge className="mr-1.5 bg-gold/15 text-gold-dark ring-gold/30">Bonus</Badge>}
                          {l.detail}
                        </span>
                        <span className="block text-xs text-muted">
                          {formatDate(l.date)} · {l.categorie} · {l.manager}
                          {l.abattement > 0 && ` · ${money(round2(l.quantity * l.unit))} convenus, abattement ${l.abattement} %`}
                        </span>
                      </span>
                    </label>
                    <span className="flex shrink-0 items-center gap-3">
                      {!estAcquise(l.status) && <MissionStatusBadge status={l.status as MissionStatus} />}
                      <span className="w-28 text-right font-medium text-navy">
                        {money(l.total)}
                        <span className="ml-1 text-[11px] font-normal text-muted">{l.base}</span>
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
          <div className="flex items-center justify-end gap-3">
            <p className="text-xs text-muted">
              Le bouton du haut envoie le récapitulatif et ferme ces lignes d’un coup. Celui-ci ne
              fait que les fermer, pour un envoi déjà fait autrement.
            </p>
            <SubmitButton variant="secondary" pendingLabel="…" disabled={!pretes.length}>
              Marquer comme envoyé, sans écrire
            </SubmitButton>
          </div>
        </form>
      )}
    </>
  )
}
