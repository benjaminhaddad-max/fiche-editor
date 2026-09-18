import Link from 'next/link'
import { Download, FileText } from 'lucide-react'
import { BulletinsUpload } from '@/components/admin/BulletinsUpload'
import { Tabs } from '@/components/ui/Tabs'
import { remunerationsDuMois } from '@/lib/paie/remunerations'
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

export const maxDuration = 300

export default async function PaiePage({
  searchParams,
}: {
  searchParams: Promise<{ mois?: string; onglet?: string }>
}) {
  await requireRole('admin')
  const { mois, onglet } = await searchParams
  const cycle = mois && /^\d{4}-\d{2}$/.test(mois) ? cycleForMonth(mois) : activeCycle()
  const courant = onglet === 'tous' || onglet === 'bulletins' ? onglet : 'social'
  const lien = (o: string) => `/admin/paie?onglet=${o}&mois=${cycle.month}`
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
        title="Paie et rémunérations"
        description="Tout ce que vous versez chaque mois, quel que soit le statut : factures des indépendants, éléments variables des salariés, bulletins."
      />

      <Tabs
        current={courant}
        items={[
          { key: 'social', label: 'À envoyer au social', href: lien('social') },
          { key: 'tous', label: 'Tout le monde', href: lien('tous') },
          { key: 'bulletins', label: 'Bulletins', href: lien('bulletins') },
        ]}
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

      {courant !== 'social' ? (
        courant === 'bulletins' ? (
          <BulletinsUploadSection cycle={cycle} />
        ) : (
          <ToutLeMonde cycle={cycle} />
        )
      ) : lignes.length === 0 ? (
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

/** Vue d'ensemble : ce que chaque personne coûte sur le mois. */
async function ToutLeMonde({ cycle }: { cycle: ReturnType<typeof activeCycle> }) {
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
async function BulletinsUploadSection({ cycle }: { cycle: ReturnType<typeof activeCycle> }) {
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
