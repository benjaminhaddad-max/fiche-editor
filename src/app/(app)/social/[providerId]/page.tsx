import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AlertTriangle, ArrowLeft } from 'lucide-react'
import { ElementsForm } from '@/components/paie/ElementsForm'
import { ActionsFiche } from '@/components/social/ActionsFiche'
import { ongletsSocial } from '@/components/social/onglets'
import { Badge } from '@/components/ui/Badge'
import { Card, PageHeader } from '@/components/ui/Page'
import { formatDate, money } from '@/lib/format'
import { estAcquise } from '@/lib/paie'
import { createServiceClient } from '@/lib/supabase/service'
import { ligneDuSalarie } from '@/lib/social/donnees'
import { requireEquipeSocial } from '@/lib/social/parametres'
import { MUTUELLE_LABEL, priseEnChargeTransport, PROFIL_LABEL, STATUT_LABEL, STATUT_STYLE } from '@/lib/social/types'

const libelleMois = (m: string) =>
  new Date(`${m}-15T12:00:00Z`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' })

const periode = (d: string | null, f: string | null) => (d ? (f && f !== d ? `du ${formatDate(d)} au ${formatDate(f)}` : `le ${formatDate(d)}`) : '')

function Ligne({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-2.5 sm:grid-cols-[12rem_1fr]">
      <dt className="text-sm text-muted">{titre}</dt>
      <dd className="text-sm text-navy">{children}</dd>
    </div>
  )
}

/** Un justificatif affiché dans la page, sans téléchargement (§6). */
function Apercu({ id, titre }: { id: string; titre: string }) {
  return (
    <figure className="overflow-hidden rounded-xl border border-line bg-white">
      <figcaption className="flex items-center justify-between border-b border-line px-3 py-2 text-xs font-medium text-navy">
        {titre}
        <a href={`/api/social/piece/${id}`} target="_blank" rel="noreferrer" className="text-gold-dark hover:underline">
          Ouvrir
        </a>
      </figcaption>
      <object data={`/api/social/piece/${id}`} className="h-[28rem] w-full" aria-label={titre}>
        <p className="p-3 text-xs text-muted">Aperçu indisponible : utilisez « Ouvrir ».</p>
      </object>
    </figure>
  )
}

const ACTIONS: Record<string, string> = {
  social_saisie: 'Saisie du salarié',
  social_correction: 'Correction',
  social_validation: 'Validation',
  social_renvoi: 'Renvoi pour correction',
  social_fiche: 'Fiche modifiée',
  social_acces: 'Accès envoyé',
}

/** La fiche du mois d'un salarié : tout ce qu'il a déclaré, les pièces, les gestes. */
export default async function FicheSocialPage({
  params,
  searchParams,
}: {
  params: Promise<{ providerId: string }>
  searchParams: Promise<{ mois?: string; corriger?: string }>
}) {
  const user = await requireEquipeSocial()
  const { providerId } = await params
  const sp = await searchParams
  const mois = sp.mois && /^\d{4}-\d{2}$/.test(sp.mois) ? sp.mois : new Date().toISOString().slice(0, 7)
  const l = await ligneDuSalarie(providerId, mois)
  if (!l) notFound()
  const s = l.saisie
  const repondu = Boolean(s.submitted_at) && s.status !== 'attente'

  const db = createServiceClient()
  const { data: journal } = await db
    .from('inv_audit_log')
    .select('action, payload, created_at, auteur:inv_users!inv_audit_log_actor_id_fkey(full_name)')
    .eq('entity_id', providerId)
    .like('action', 'social_%')
    .order('created_at', { ascending: false })
    .limit(40)
  const duMois = ((journal ?? []) as unknown as { action: string; payload: Record<string, unknown>; created_at: string; auteur: { full_name: string } | null }[]).filter(
    (j) => !j.payload?.periode || j.payload.periode === mois
  )
  const corriger = sp.corriger === '1' && s.status !== 'transmis'

  return (
    <>
      <PageHeader
        title={l.salarie.nom}
        description={`${PROFIL_LABEL[l.salarie.profil]} · ${l.salarie.matricule ? `matricule ${l.salarie.matricule}` : 'sans matricule Silae'} · ${libelleMois(mois)}`}
        tabs={ongletsSocial(user.role === 'admin')}
        currentTab="mois"
      />
      <Link href={`/social?groupe=${l.groupe}&mois=${mois}`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-navy/70 hover:text-navy">
        <ArrowLeft size={14} />
        Retour au tableau
      </Link>

      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-5">
          {corriger ? (
            <Card className="p-5">
              <p className="mb-4 text-sm text-muted">
                Correction faite par vous à la place du salarié : chaque champ changé est tracé au journal, et la saisie repasse « à valider ».
              </p>
              <ElementsForm period={mois} existant={s} precedent={null} vacataire={l.salarie.profil === 'vacataire'} correction={{ providerId }} />
            </Card>
          ) : (
            <Card className="p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <Badge className={STATUT_STYLE[s.status]}>{STATUT_LABEL[s.status]}</Badge>
                {s.submitted_at && <span className="text-xs text-muted">Envoyé le {formatDate(s.submitted_at)}</span>}
              </div>
              {s.status === 'a_corriger' && s.return_comment && (
                <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">Renvoyé : « {s.return_comment} »</p>
              )}
              {!repondu ? (
                <p className="text-sm text-muted">Pas encore de réponse pour ce mois.</p>
              ) : s.nothing_to_report ? (
                <p className="text-sm text-navy">Rien à signaler ce mois-ci.</p>
              ) : (
                <dl className="divide-y divide-line/60">
                  <Ligne titre="Transport">
                    {s.transport
                      ? `${money(s.transport_amount)} par mois — prise en charge ${money(priseEnChargeTransport(s.transport_amount))} (50 %)${s.transport_renewed ? ' · reconduit' : ''}`
                      : 'Pas d’abonnement'}
                  </Ligne>
                  <Ligne titre="Congés payés">{s.paid_leave_days ? `${s.paid_leave_days} j ${periode(s.paid_leave_start, s.paid_leave_end)}` : '—'}</Ligne>
                  <Ligne titre="Congé sans solde">{s.unpaid_leave_days ? `${s.unpaid_leave_days} j ${periode(s.unpaid_leave_start, s.unpaid_leave_end)}` : '—'}</Ligne>
                  <Ligne titre="Arrêt de travail">{s.sick_leave_days ? `${s.sick_leave_days} j ${periode(s.sick_leave_start, s.sick_leave_end)}` : '—'}</Ligne>
                  <Ligne titre="Heures supplémentaires">
                    {s.overtime_lines.length
                      ? s.overtime_lines.map((h, i) => (
                          <p key={i}>
                            {h.heures} h {periode(h.du, h.au)} {h.motif && `— ${h.motif}`} · validées par <strong>{h.validees_par}</strong>
                          </p>
                        ))
                      : s.overtime_hours
                        ? `${s.overtime_hours} h (sans détail)`
                        : '—'}
                  </Ligne>
                  <Ligne titre="Mutuelle">
                    {MUTUELLE_LABEL[s.mutuelle]}
                    {s.mutuelle_detail && ` — ${s.mutuelle_detail}`}
                  </Ligne>
                  {s.comment && <Ligne titre="Remarque">{s.comment}</Ligne>}
                  {s.leave_detail && <Ligne titre="Détail (ancien formulaire)">{s.leave_detail}</Ligne>}
                </dl>
              )}
            </Card>
          )}

          {l.salarie.profil === 'vacataire' && (
            <Card className="p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-semibold text-navy">Missions du mois</h2>
                <p className="text-sm">
                  Net {s.missions_total !== null ? 'figé à la validation' : 'validé par les managers'} : <strong>{money(l.netMissions)}</strong>
                </p>
              </div>
              <ul className="mt-3 divide-y divide-line/60 text-sm">
                {l.missions.map((m) => (
                  <li key={m.id} className="flex flex-wrap justify-between gap-2 py-2">
                    <span className="text-navy/80">
                      {formatDate(m.date)} — {m.detail} <span className="text-xs text-muted">({m.manager})</span>
                    </span>
                    <span className={estAcquise(m.status) ? '' : 'text-amber-700'}>
                      {money(m.total)} {estAcquise(m.status) ? '' : '· en attente manager'}
                    </span>
                  </li>
                ))}
                {!l.missions.length && <li className="py-2 text-muted">Aucune mission en attente d’envoi.</li>}
              </ul>
            </Card>
          )}

          <div className="grid gap-4 xl:grid-cols-2">
            {s.transport_document && <Apercu id={s.transport_document} titre="Justificatif de transport" />}
            {s.sick_leave_document && <Apercu id={s.sick_leave_document} titre="Arrêt de travail" />}
            {s.mutuelle_document && <Apercu id={s.mutuelle_document} titre="Mutuelle" />}
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <Card className="p-5">
            <h2 className="mb-3 font-semibold text-navy">Contrôles</h2>
            {l.anomalies.length ? (
              l.anomalies.map((a) => (
                <p key={a.code} className="mb-1.5 flex items-start gap-1.5 text-sm text-amber-800">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  {a.texte}
                </p>
              ))
            ) : (
              <p className="text-sm text-emerald-700">Aucune anomalie.</p>
            )}
            <div className="mt-4">
              <ActionsFiche
                providerId={providerId}
                mois={mois}
                peutValider={repondu && s.status !== 'transmis' && s.status !== 'valide'}
                peutRenvoyer={s.status !== 'transmis'}
                anomalies={l.anomalies.length}
                onCorriger={s.status !== 'transmis' && !corriger ? `/social/${providerId}?mois=${mois}&corriger=1` : undefined}
              />
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 font-semibold text-navy">Journal</h2>
            {duMois.length ? (
              <ol className="flex flex-col gap-2.5 text-xs">
                {duMois.map((j, i) => (
                  <li key={i}>
                    <p className="text-navy">
                      <strong>{ACTIONS[j.action] ?? j.action}</strong> — {j.auteur?.full_name ?? 'automatique'}
                    </p>
                    <p className="text-muted">{new Date(j.created_at).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}</p>
                    {j.action === 'social_correction' && j.payload.modifications !== undefined && (
                      <ul className="mt-1 text-navy/70">
                        {Object.entries(j.payload.modifications as Record<string, { avant: unknown; apres: unknown }>).map(([k, d]) => (
                          <li key={k}>
                            {k} : {JSON.stringify(d.avant)} → {JSON.stringify(d.apres)}
                          </li>
                        ))}
                      </ul>
                    )}
                    {j.action === 'social_renvoi' && typeof j.payload.commentaire === 'string' && <p className="mt-1 text-navy/70">« {j.payload.commentaire} »</p>}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-xs text-muted">Rien encore ce mois-ci.</p>
            )}
          </Card>
        </div>
      </div>
    </>
  )
}
