'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Bell, CheckCheck, FileText, Send } from 'lucide-react'
import { envoyerNetPaye, relancerSalaries, validerEnMasse, type Resultat } from '@/app/(app)/social/actions'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Page'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { formatDate, money } from '@/lib/format'
import type { LigneSocial } from '@/lib/social/donnees'
import { MUTUELLE_LABEL, PROFIL_LABEL, priseEnChargeTransport, STATUT_LABEL, STATUT_STYLE, type GroupeSocial } from '@/lib/social/types'

function Retour({ r }: { r: Resultat }) {
  return (
    <>
      {r.success && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{r.success}</p>}
      {r.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{r.error}</p>}
    </>
  )
}

const repondu = (l: LigneSocial) => Boolean(l.saisie.submitted_at) && l.saisie.status !== 'attente'
const validable = (l: LigneSocial) => l.saisie.status === 'a_valider' && l.anomalies.length === 0

/** Le tableau du mois, avec la validation en masse et la relance des non-répondants. */
export function TableauSocial({ mois, groupe, lignes }: { mois: string; groupe: GroupeSocial; lignes: LigneSocial[] }) {
  const [sel, setSel] = useState<Set<string>>(() => new Set(lignes.filter(validable).map((l) => l.salarie.providerId)))
  const [aRelancer, setARelancer] = useState<Set<string>>(() => new Set())
  const [masse, actionMasse] = useActionState<Resultat, FormData>(validerEnMasse, {})
  const [relance, actionRelance] = useActionState<Resultat, FormData>(relancerSalaries, {})
  const bascule = (set: (f: (s: Set<string>) => Set<string>) => void, id: string) =>
    set((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const sansReponse = lignes.filter((l) => !repondu(l))
  const vacataires = groupe === 'vacataires'

  return (
    <>
      <div className="mb-3 flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white px-4 py-3">
          <form action={actionMasse} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="mois" value={mois} />
            {[...sel].map((id) => (
              <input key={id} type="hidden" name="provider_id" value={id} />
            ))}
            <span className="text-sm text-navy">
              <strong>{sel.size}</strong> saisie(s) sans anomalie cochée(s)
            </span>
            <SubmitButton size="sm" pendingLabel="Validation…" disabled={!sel.size}>
              <CheckCheck size={14} />
              Valider la sélection
            </SubmitButton>
          </form>
          {sansReponse.length > 0 && (
            <form action={actionRelance} className="flex flex-wrap items-center gap-3">
              <input type="hidden" name="mois" value={mois} />
              <input type="hidden" name="groupe" value={groupe} />
              {[...aRelancer].map((id) => (
                <input key={id} type="hidden" name="provider_id" value={id} />
              ))}
              <button
                type="button"
                onClick={() => setARelancer(new Set(sansReponse.map((l) => l.salarie.providerId)))}
                className="cursor-pointer text-xs text-navy/70 underline-offset-2 hover:underline"
              >
                Cocher les {sansReponse.length} sans réponse
              </button>
              <SubmitButton size="sm" variant="secondary" pendingLabel="Envoi…" disabled={!aRelancer.size}>
                <Bell size={14} />
                Relancer ({aRelancer.size}) — email et SMS
              </SubmitButton>
            </form>
          )}
        </div>
        <Retour r={masse} />
        <Retour r={relance} />
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-cream-muted text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="w-10 px-3 py-3" />
                <th className="px-3 py-3 font-medium">Salarié</th>
                <th className="px-3 py-3 font-medium">Statut</th>
                {vacataires && <th className="px-3 py-3 text-right font-medium">Missions (net)</th>}
                <th className="px-3 py-3 font-medium">Transport</th>
                <th className="px-3 py-3 text-right font-medium">CP</th>
                <th className="px-3 py-3 text-right font-medium">Sans solde</th>
                <th className="px-3 py-3 text-right font-medium">Arrêt</th>
                <th className="px-3 py-3 font-medium">Heures sup.</th>
                <th className="px-3 py-3 font-medium">Mutuelle</th>
                <th className="px-3 py-3 font-medium">Contrôles</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {lignes.map((l) => {
                const s = l.saisie
                const r = repondu(l)
                const id = l.salarie.providerId
                return (
                  <tr key={id} className={!r ? 'bg-amber-50/40 align-top' : 'align-top'}>
                    <td className="px-3 py-3">
                      {validable(l) ? (
                        <input
                          type="checkbox"
                          checked={sel.has(id)}
                          onChange={() => bascule(setSel, id)}
                          aria-label={`Valider ${l.salarie.nom}`}
                          className="h-4 w-4 cursor-pointer accent-navy"
                        />
                      ) : !r ? (
                        <input
                          type="checkbox"
                          checked={aRelancer.has(id)}
                          onChange={() => bascule(setARelancer, id)}
                          aria-label={`Relancer ${l.salarie.nom}`}
                          className="h-4 w-4 cursor-pointer accent-amber-600"
                        />
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
                      <Link href={`/social/${id}?mois=${mois}`} className="font-medium text-navy hover:underline">
                        {l.salarie.nom}
                      </Link>
                      <p className="text-xs text-muted">
                        {PROFIL_LABEL[l.salarie.profil]} · {l.salarie.matricule ? `mat. ${l.salarie.matricule}` : <span className="text-red-700">sans matricule</span>}
                      </p>
                      {!r && s.reminded_at && <p className="text-xs text-amber-700">relancé le {formatDate(s.reminded_at)}</p>}
                    </td>
                    <td className="px-3 py-3">
                      <Badge className={STATUT_STYLE[s.status]}>{STATUT_LABEL[s.status]}</Badge>
                      {s.nothing_to_report && <p className="mt-1 text-xs text-muted">rien à signaler</p>}
                    </td>
                    {vacataires && (
                      <td className="px-3 py-3 text-right text-navy/80">
                        {money(l.netMissions)}
                        {l.missionsEnAttente > 0 && <p className="text-xs text-amber-700">{l.missionsEnAttente} en attente manager</p>}
                      </td>
                    )}
                    <td className="px-3 py-3 text-navy/80">
                      {!r ? '—' : s.transport ? (
                        <span>
                          {money(s.transport_amount)} → {money(priseEnChargeTransport(s.transport_amount))}
                          {s.transport_document && <FileText size={12} className="ml-1 inline text-gold-dark" aria-label="justificatif" />}
                        </span>
                      ) : (
                        'non'
                      )}
                    </td>
                    <td className="px-3 py-3 text-right text-navy/80">{r && s.paid_leave_days ? s.paid_leave_days : '—'}</td>
                    <td className="px-3 py-3 text-right text-navy/80">{r && s.unpaid_leave_days ? s.unpaid_leave_days : '—'}</td>
                    <td className="px-3 py-3 text-right text-navy/80">{r && s.sick_leave_days ? s.sick_leave_days : '—'}</td>
                    <td className="px-3 py-3 text-xs text-navy/80">
                      {r && s.overtime_lines.length
                        ? s.overtime_lines.map((h, i) => (
                            <p key={i}>
                              {h.heures} h · validées par <strong>{h.validees_par}</strong>
                            </p>
                          ))
                        : r && s.overtime_hours
                          ? `${s.overtime_hours} h`
                          : '—'}
                    </td>
                    <td className="px-3 py-3 text-navy/80">{r ? MUTUELLE_LABEL[s.mutuelle] : '—'}</td>
                    <td className="px-3 py-3 text-xs">
                      {l.anomalies.length ? (
                        l.anomalies.map((a) => (
                          <p key={a.code} className="flex items-start gap-1 text-amber-800">
                            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                            {a.texte}
                          </p>
                        ))
                      ) : r ? (
                        <span className="text-emerald-700">RAS</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}

/** L'envoi à Net Paye : un clic de Shirel, confirmé. */
export function ActionsMois({ mois, groupe, pret }: { mois: string; groupe: GroupeSocial; pret: boolean }) {
  const [r, action] = useActionState<Resultat, FormData>(envoyerNetPaye, {})
  return (
    <div className="flex flex-col items-end gap-2">
      <form
        action={action}
        onSubmit={(e) => {
          if (!confirm('Envoyer le fichier et les justificatifs à Net Paye ? Les lignes passeront « transmis à la paie ».')) e.preventDefault()
        }}
      >
        <input type="hidden" name="mois" value={mois} />
        <input type="hidden" name="groupe" value={groupe} />
        <SubmitButton size="sm" pendingLabel="Envoi…" disabled={!pret}>
          <Send size={14} />
          Envoyer à Net Paye
        </SubmitButton>
      </form>
      <Retour r={r} />
    </div>
  )
}
