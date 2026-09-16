import Link from 'next/link'
import { Download } from 'lucide-react'
import { Badge, MissionStatusBadge } from '@/components/ui/Badge'
import { Card, EmptyState, PageHeader, StatTile } from '@/components/ui/Page'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { requireRole } from '@/lib/auth'
import { activeCycle, cycleForMonth, nextCycle, previousCycle } from '@/lib/cycle'
import { formatDate, formatDateLong, money, round2 } from '@/lib/format'
import { EMPLOYMENT_LABEL } from '@/lib/labels'
import { lignesPaie } from '@/lib/paie'
import { createServiceClient } from '@/lib/supabase/service'
import type { MissionStatus } from '@/lib/types'
import { cloturerPaie } from './actions'

export default async function PaiePage({ searchParams }: { searchParams: Promise<{ mois?: string }> }) {
  await requireRole('admin')
  const { mois } = await searchParams
  const cycle = mois && /^\d{4}-\d{2}$/.test(mois) ? cycleForMonth(mois) : activeCycle()
  const lignes = await lignesPaie(cycle.periodStart, cycle.periodEnd)
  const { data: lots } = await createServiceClient()
    .from('inv_payroll_batches')
    .select('id, total_ht, lines, created_at, auteur:inv_users!inv_payroll_batches_created_by_fkey(full_name)')
    .eq('cycle_month', cycle.month)
    .order('created_at')

  const pretes = lignes.filter((l) => l.status === 'approved')
  const enCours = lignes.filter((l) => l.status !== 'approved')
  const parPersonne = new Map<string, typeof lignes>()
  for (const l of lignes) parPersonne.set(l.personne, [...(parPersonne.get(l.personne) ?? []), l])

  return (
    <>
      <PageHeader
        title="Paie"
        description="Vacataires et alternants ne facturent pas : leurs prestations et bonus du mois partent au service social."
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-sm">
          <Link href={`/admin/paie?mois=${previousCycle(cycle).month}`} className="rounded-lg px-2 py-1 text-navy/60 hover:bg-cream-deep">←</Link>
          <p className="font-semibold capitalize text-navy">{cycle.label}</p>
          <Link href={`/admin/paie?mois=${nextCycle(cycle).month}`} className="rounded-lg px-2 py-1 text-navy/60 hover:bg-cream-deep">→</Link>
          <span className="text-muted">à envoyer au social à partir du {formatDateLong(cycle.statementDate)}</span>
        </div>
        <a
          href={`/api/paie?mois=${cycle.month}`}
          className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-medium text-navy hover:bg-cream-muted"
        >
          <Download size={15} />
          Export CSV du mois
        </a>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile label="Prêt à envoyer" value={money(round2(pretes.reduce((s, l) => s + l.total, 0)))} sub={`${pretes.length} ligne(s)`} accent="emerald" />
        <StatTile label="Encore en validation" value={String(enCours.length)} accent={enCours.length ? 'amber' : 'slate'} />
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
                <p className="text-sm font-semibold text-navy">{money(round2(ls.reduce((s, l) => s + l.total, 0)))}</p>
              </div>
              <ul className="divide-y divide-line/60">
                {ls.map((l) => (
                  <li key={l.id} className="flex items-start justify-between gap-4 px-5 py-2.5 text-sm">
                    <label className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        name="mission_id"
                        value={l.id}
                        defaultChecked={l.status === 'approved'}
                        disabled={l.status !== 'approved'}
                        className="mt-0.5 h-4 w-4 accent-navy"
                      />
                      <span>
                        <span className="text-navy">
                          {l.kind === 'bonus' && <Badge className="mr-1.5 bg-gold/15 text-gold-dark ring-gold/30">Bonus</Badge>}
                          {l.detail}
                        </span>
                        <span className="block text-xs text-muted">
                          {formatDate(l.date)} · {l.categorie} · {l.manager}
                        </span>
                      </span>
                    </label>
                    <span className="flex shrink-0 items-center gap-3">
                      {l.status !== 'approved' && <MissionStatusBadge status={l.status as MissionStatus} />}
                      <span className="w-24 text-right font-medium text-navy">{money(l.total)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
          <div className="flex items-center justify-end gap-3">
            <p className="text-xs text-muted">Téléchargez l’export, envoyez-le au social, puis marquez les lignes comme envoyées.</p>
            <SubmitButton pendingLabel="…" disabled={!pretes.length}>
              Marquer comme envoyé au social
            </SubmitButton>
          </div>
        </form>
      )}
    </>
  )
}
