import Link from 'next/link'
import { AlertTriangle, Bell, MessageSquare, Send } from 'lucide-react'
import { CalendrierMois } from '@/components/cycle/CalendrierMois'
import { InvoiceStatusBadge } from '@/components/ui/Badge'
import { Card, EmptyState, StatTile } from '@/components/ui/Page'
import { PrestationsNav } from '@/components/prestations/PrestationsNav'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { requireRole } from '@/lib/auth'
import { activeCycle, cycleForMonth, nextCycle, previousCycle, todayParis } from '@/lib/cycle'
import { formatDateLong, money, round2 } from '@/lib/format'
import { createServiceClient } from '@/lib/supabase/service'
import type { AiCheck, Employment, InvoiceStatus } from '@/lib/types'
import { envoyerMaintenant, relancer } from './actions'

interface Ligne {
  provider_id: string
  manager_id: string
  total_ht: number
  status: string
  statement_id: string | null
  provider: { legal_name: string; employment_type: Employment } | null
}

export default async function BordereauxPage({
  searchParams,
}: {
  searchParams: Promise<{ mois?: string }>
}) {
  const user = await requireRole('manager', 'admin')
  const { mois } = await searchParams
  const today = todayParis()
  const cycle = mois && /^\d{4}-\d{2}$/.test(mois) ? cycleForMonth(mois) : activeCycle(today)
  const envoye = today >= cycle.statementDate
  const db = createServiceClient()

  // Lignes du mois, tous statuts utiles : c'est la matière du bordereau.
  const { data: lData } = await db
    .from('inv_missions')
    .select('provider_id, manager_id, total_ht, status, statement_id, provider:inv_providers(legal_name, employment_type)')
    .gte('start_date', cycle.periodStart)
    .lte('start_date', cycle.periodEnd)
    .in('status', ['submitted', 'manager_approved', 'approved', 'invoiced'])
  const lignes = (lData ?? []) as unknown as Ligne[]

  const { data: sData } = await db
    .from('inv_statements')
    .select(
      `id, provider_id, total_ht, status, reminder_count, reminded_at,
       invoice:inv_invoices!inv_statements_invoice_id_fkey(id, number, status, ai_check)`
    )
    .eq('cycle_month', cycle.month)
  const bordereaux = new Map(
    ((sData ?? []) as unknown as {
      id: string
      provider_id: string
      total_ht: number
      status: string
      reminder_count: number
      invoice: { id: string; number: string; status: InvoiceStatus; ai_check: AiCheck | null } | null
    }[]).map((s) => [s.provider_id, s])
  )

  // Un manager ne suit que les prestataires pour qui il a des lignes.
  const parPresta = new Map<
    string,
    { nom: string; salarie: boolean; total: number; sienne: number; enAttente: number }
  >()
  for (const l of lignes) {
    const c = parPresta.get(l.provider_id) ?? {
      nom: l.provider?.legal_name ?? '—',
      salarie: l.provider?.employment_type !== 'independant',
      total: 0,
      sienne: 0,
      enAttente: 0,
    }
    if (['approved', 'invoiced', 'manager_approved'].includes(l.status)) c.total += Number(l.total_ht)
    if (l.manager_id === user.id) c.sienne += Number(l.total_ht)
    if (l.status === 'submitted') c.enAttente++
    parPresta.set(l.provider_id, c)
  }
  const visibles = [...parPresta.entries()]
    .filter(([, v]) => user.role === 'admin' || v.sienne > 0)
    .sort((a, b) => a[1].nom.localeCompare(b[1].nom, 'fr'))

  const recus = visibles.filter(([id]) => {
    const s = bordereaux.get(id)?.invoice?.status
    return s && s !== 'issued'
  }).length
  const independants = visibles.filter(([, v]) => !v.salarie)
  const enAttente = visibles.reduce((n, [, v]) => n + v.enAttente, 0)

  const prec = previousCycle(cycle)
  const suiv = nextCycle(cycle)

  return (
    <>
      <PrestationsNav
        user={user}
        current="bordereaux"
        description="Le bordereau global part le 1er : toutes les missions de chaque prestataire, tous pôles réunis."
      />
      <CalendrierMois pour="manager" />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-sm">
          <Link href={`/validation/bordereaux?mois=${prec.month}`} className="rounded-lg px-2 py-1 text-navy/60 hover:bg-cream-deep">
            ←
          </Link>
          <p className="font-semibold capitalize text-navy">{cycle.label}</p>
          <Link href={`/validation/bordereaux?mois=${suiv.month}`} className="rounded-lg px-2 py-1 text-navy/60 hover:bg-cream-deep">
            →
          </Link>
          <span className="text-muted">
            {envoye
              ? `bordereaux envoyés le ${formatDateLong(cycle.statementDate)} · factures jusqu’au ${formatDateLong(cycle.invoiceDeadline)}`
              : `aperçu — envoi le ${formatDateLong(cycle.statementDate)}`}
          </span>
        </div>
        {user.role === 'admin' && (
          <form action={envoyerMaintenant}>
            <input type="hidden" name="mois" value={cycle.month} />
            <SubmitButton size="sm" variant="secondary" pendingLabel="Envoi…">
              <Send size={14} />
              {envoye ? 'Renvoyer les lignes ajoutées' : 'Envoyer les bordereaux maintenant'}
            </SubmitButton>
          </form>
        )}
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Montant du mois"
          value={money(round2(visibles.reduce((s, [, v]) => s + v.total, 0)))}
          sub={`${visibles.length} personne(s)`}
          accent="brand"
        />
        <StatTile
          label="Encore à valider"
          value={String(enAttente)}
          sub={enAttente ? 'hors bordereau si non validées à temps' : '—'}
          accent={enAttente ? 'amber' : 'slate'}
        />
        <StatTile
          label="Factures reçues"
          value={`${recus} / ${independants.length}`}
          accent={recus === independants.length ? 'emerald' : 'amber'}
        />
      </div>

      {visibles.length === 0 ? (
        <EmptyState title="Aucune prestation sur ce mois" />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-cream-muted text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Prestataire</th>
                  <th className="px-4 py-3 text-right font-medium">Bordereau HT</th>
                  {user.role === 'manager' && <th className="px-4 py-3 text-right font-medium">Dont vous</th>}
                  <th className="px-4 py-3 font-medium">Facture</th>
                  <th className="px-4 py-3 text-right font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {visibles.map(([id, v]) => {
                  const s = bordereaux.get(id)
                  const facture = s?.invoice
                  const attendue = envoye && !v.salarie && (!facture || facture.status === 'issued')
                  return (
                    <tr key={id} className="align-top">
                      <td className="px-4 py-3">
                        <p className="font-medium text-navy">{v.nom}</p>
                        {v.salarie && <p className="text-xs text-muted">Salarié — part à la paie</p>}
                        {v.enAttente > 0 && (
                          <p className="text-xs text-amber-700">{v.enAttente} ligne(s) encore à valider</p>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-navy">
                        {money(s?.total_ht ?? v.total)}
                      </td>
                      {user.role === 'manager' && (
                        <td className="whitespace-nowrap px-4 py-3 text-right text-navy/70">{money(v.sienne)}</td>
                      )}
                      <td className="px-4 py-3">
                        {v.salarie ? (
                          <span className="text-xs text-muted">—</span>
                        ) : facture ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <InvoiceStatusBadge status={facture.status} />
                            <span className="text-xs text-navy/70">{facture.number}</span>
                            {facture.ai_check?.matches === false && (
                              <span className="inline-flex items-center gap-1 text-xs text-amber-700" title={facture.ai_check.message ?? ''}>
                                <AlertTriangle size={12} />
                                écart de montant
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted">{envoye ? 'Pas encore reçue' : 'Bordereau pas encore envoyé'}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5">
                          {attendue && s && (
                            <form action={relancer}>
                              <input type="hidden" name="statement_id" value={s.id} />
                              <SubmitButton size="sm" variant="secondary" pendingLabel="…" title="Email + SMS">
                                <Bell size={13} />
                                Relancer{s.reminder_count ? ` (${s.reminder_count})` : ''}
                              </SubmitButton>
                            </form>
                          )}
                          <Link
                            href={`/messages?nouveau&objet=${encodeURIComponent(`Bordereau de ${cycle.label}`)}`}
                            title="Écrire au prestataire"
                            className="inline-flex items-center rounded-lg border border-line px-2 py-1.5 text-navy/70 hover:bg-cream-muted"
                          >
                            <MessageSquare size={13} />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  )
}
