import Link from 'next/link'
import { Suspense } from 'react'
import { Send } from 'lucide-react'
import { CalendrierMois } from '@/components/cycle/CalendrierMois'
import { LigneBordereau, type LigneDetail } from '@/components/bordereaux/LigneBordereau'
import { Card, EmptyState, StatTile } from '@/components/ui/Page'
import { PrestationsNav } from '@/components/prestations/PrestationsNav'
import { RecherchePrestataire } from '@/components/prestations/RecherchePrestataire'
import { correspondPrestataire } from '@/lib/recherche-prestataire'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { requireRole } from '@/lib/auth'
import { activeCycle, cycleForMonth, nextCycle, previousCycle, todayParis } from '@/lib/cycle'
import { formatDateLong, money, round2 } from '@/lib/format'
import { createServiceClient } from '@/lib/supabase/service'
import type { AiCheck, Employment, InvoiceStatus } from '@/lib/types'
import { envoyerMaintenant, relancer } from './actions'
import { porterEcheance } from '@/app/(app)/missions/actions'
import { echeancesProposees } from '@/lib/echeances'
import { getBrandId } from '@/lib/brand'

interface Ligne {
  id: string
  provider_id: string
  manager_id: string
  detail: string
  start_date: string
  total_ht: number
  status: string
  statement_id: string | null
  provider: { legal_name: string; employment_type: Employment } | null
  category: { name: string } | null
  manager: { full_name: string } | null
}

export default async function BordereauxPage({
  searchParams,
}: {
  searchParams: Promise<{ mois?: string; q?: string }>
}) {
  const user = await requireRole('manager', 'admin')
  const { mois, q } = await searchParams
  const cherche = (q ?? '').trim()
  // La recherche suit le changement de mois : on cherche une personne, pas un mois.
  const suffixe = cherche ? `&q=${encodeURIComponent(cherche)}` : ''
  const today = todayParis()
  const cycle = mois && /^\d{4}-\d{2}$/.test(mois) ? cycleForMonth(mois) : activeCycle(today)
  const envoye = today >= cycle.statementDate
  const db = createServiceClient()

  // Lignes du mois, tous statuts utiles : c'est la matière du bordereau.
  const { data: lData } = await db
    .from('inv_missions')
    .select(
      `id, provider_id, manager_id, detail, start_date, total_ht, status, statement_id,
       provider:inv_providers(legal_name, employment_type),
       category:inv_categories(name),
       manager:inv_users!inv_missions_manager_id_fkey(full_name)`
    )
    .eq('brand', getBrandId())
    .gte('start_date', cycle.periodStart)
    .lte('start_date', cycle.periodEnd)
    .in('status', ['submitted', 'manager_approved', 'approved', 'invoiced'])
    .order('start_date')
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
    {
      nom: string
      salarie: boolean
      total: number
      sienne: number
      enAttente: number
      lignes: LigneDetail[]
    }
  >()
  for (const l of lignes) {
    const c = parPresta.get(l.provider_id) ?? {
      nom: l.provider?.legal_name ?? '—',
      salarie: l.provider?.employment_type !== 'independant',
      total: 0,
      sienne: 0,
      enAttente: 0,
      lignes: [],
    }
    if (['approved', 'invoiced', 'manager_approved'].includes(l.status)) c.total += Number(l.total_ht)
    if (l.manager_id === user.id) c.sienne += Number(l.total_ht)
    if (l.status === 'submitted') c.enAttente++
    // Un manager relit son mois : il voit tout le bordereau de la personne,
    // et sait lesquelles sont les siennes.
    c.lignes.push({
      id: l.id,
      detail: l.detail,
      date: l.start_date,
      categorie: l.category?.name ?? '—',
      manager: l.manager?.full_name ?? '—',
      sienne: l.manager_id === user.id,
      montant: Number(l.total_ht),
      status: l.status,
    })
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

  // Les tuiles gardent le mois entier ; seule la liste suit la recherche.
  const affiches = visibles.filter(([, v]) => correspondPrestataire(v.nom, cherche))

  // Ce que les contrats prévoient et que personne n'a porté sur le mois :
  // une échéance oubliée, c'est quelqu'un qui n'est pas payé.
  const aPorter = await echeancesProposees(today, {
    managerId: user.role === 'manager' ? user.id : undefined,
  })

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
          <Link href={`/validation/bordereaux?mois=${prec.month}${suffixe}`} className="rounded-lg px-2 py-1 text-navy/60 hover:bg-cream-deep">
            ←
          </Link>
          <p className="font-semibold capitalize text-navy">{cycle.label}</p>
          <Link href={`/validation/bordereaux?mois=${suiv.month}${suffixe}`} className="rounded-lg px-2 py-1 text-navy/60 hover:bg-cream-deep">
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

      {aPorter.length > 0 && (
        <Card className="mb-6 overflow-hidden">
          <div className="border-b border-line bg-cream-muted px-4 py-3 sm:px-5">
            <p className="text-sm font-semibold text-navy">
              {aPorter.length} échéance{aPorter.length > 1 ? 's' : ''} de contrat à porter sur le mois
            </p>
            <p className="mt-0.5 text-xs text-muted">
              Elles ne s’ajoutent plus d’elles-mêmes, pour ne pas doubler ce que la personne a
              déclaré de son côté. Vérifiez que le travail n’est pas déjà dans son bordereau, puis
              ajoutez-la.
            </p>
          </div>
          <ul className="divide-y divide-line/60">
            {aPorter.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-5">
                <span className="min-w-0">
                  <span className="text-sm font-medium text-navy">{e.providerNom}</span>
                  <span className="block text-xs text-muted">
                    {e.label} — échéance du {formatDateLong(e.dueDate)}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="text-sm font-semibold text-navy">{money(e.montant)}</span>
                  <form action={porterEcheance}>
                    <input type="hidden" name="instalment_id" value={e.id} />
                    <SubmitButton size="sm" variant="secondary" pendingLabel="…">
                      Ajouter
                    </SubmitButton>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {visibles.length > 0 && (
        <Suspense fallback={null}>
          <RecherchePrestataire className="mb-4" />
        </Suspense>
      )}

      {visibles.length === 0 ? (
        <EmptyState title="Aucune prestation sur ce mois" />
      ) : affiches.length === 0 ? (
        <EmptyState title={`Personne ne correspond à « ${cherche} » sur ce mois`} />
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
                {affiches.map(([id, v]) => {
                  const st = bordereaux.get(id)
                  const facture = st?.invoice ?? null
                  return (
                    <LigneBordereau
                      key={id}
                      nom={v.nom}
                      salarie={v.salarie}
                      enAttente={v.enAttente}
                      total={st?.total_ht ?? v.total}
                      sienne={v.sienne}
                      montrerSienne={user.role === 'manager'}
                      lignes={v.lignes}
                      facture={facture}
                      statementId={st?.id ?? null}
                      relanceCount={st?.reminder_count ?? 0}
                      attendue={envoye && !v.salarie && (!facture || facture.status === 'issued')}
                      envoye={envoye}
                      objetMessage={`Bordereau de ${cycle.label}`}
                      relancer={relancer}
                    />
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
