import Link from 'next/link'
import { CheckCircle2, Lock, MessageSquareWarning } from 'lucide-react'
import { ElementsForm } from '@/components/paie/ElementsForm'
import { Card, PageHeader } from '@/components/ui/Page'
import { formatDate, formatDateLong, money } from '@/lib/format'
import { estAcquise, lignesPaie } from '@/lib/paie'
import { createServiceClient } from '@/lib/supabase/service'
import { etapes, moisASaisir, moisPrecedentDe, saisieOuverte } from '@/lib/social/calendrier'
import { lireParametres } from '@/lib/social/parametres'
import { lireSaisie } from '@/lib/social/saisie'
import { requireSalarie } from '@/lib/social/salarie'
import { groupeDuProfil, STATUT_LABEL } from '@/lib/social/types'

const libelleMois = (m: string) =>
  new Date(`${m}-15T12:00:00Z`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' })

/**
 * Le formulaire mensuel du salarié, dans l'Espace Social. Un salarié n'a
 * pas de facture à déposer ; il dit ici ce qui change sur son bulletin.
 */
export default async function ElementsPaiePage({ searchParams }: { searchParams: Promise<{ mois?: string }> }) {
  const { mois } = await searchParams
  const { salarie } = await requireSalarie()
  const { calendrier } = await lireParametres()
  const groupe = groupeDuProfil(salarie.profil)
  const enCours = moisASaisir(groupe, calendrier)
  const period = mois && /^\d{4}-\d{2}$/.test(mois) ? mois : enCours

  const db = createServiceClient()
  const [{ data }, { data: avant }] = await Promise.all([
    db.from('inv_payroll_inputs').select('*').eq('provider_id', salarie.providerId).eq('period', period).maybeSingle(),
    db
      .from('inv_payroll_inputs')
      .select('transport, transport_amount')
      .eq('provider_id', salarie.providerId)
      .eq('period', moisPrecedentDe(period))
      .maybeSingle(),
  ])
  const saisie = data ? lireSaisie(data, period) : null
  const cloture = etapes(groupe, period, calendrier).find((e) => e.cle === 'cloture')!
  const modifiable =
    saisie?.status === 'a_corriger' ||
    (period === enCours && saisieOuverte(groupe, period, calendrier) && !['valide', 'transmis'].includes(saisie?.status ?? ''))

  // Les missions du vacataire viennent de ses déclarations, validées par
  // son manager : elles ne se ressaisissent pas ici.
  const [y, mm] = period.split('-').map(Number)
  const fin = new Date(Date.UTC(y, mm, 0)).toISOString().slice(0, 10)
  const missions =
    salarie.profil === 'vacataire'
      ? (await lignesPaie(`${period}-01`, fin, { avecEnvoyees: true })).filter((l) => l.providerId === salarie.providerId)
      : []
  const net = Math.round(missions.filter((l) => estAcquise(l.status) || l.status === 'invoiced').reduce((t, l) => t + l.total, 0) * 100) / 100

  return (
    <>
      <PageHeader
        title="Mes éléments de paie"
        description={`Pour votre bulletin de ${libelleMois(period)}. À renseigner avant le ${formatDateLong(cloture.date)}${cloture.heure >= 24 ? ' au soir' : ` à ${cloture.heure} h`}.`}
      />

      {saisie?.status === 'a_corriger' && (
        <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <MessageSquareWarning size={16} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">L’équipe paie vous demande une correction.</p>
            {saisie.return_comment && <p className="mt-1">« {saisie.return_comment} »</p>}
          </div>
        </div>
      )}
      {saisie?.submitted_at && saisie.status !== 'a_corriger' && (
        <div className="mb-5 flex items-center gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <CheckCircle2 size={16} />
          {saisie.nothing_to_report ? 'Rien à signaler ce mois-ci : c’est noté.' : 'Vos éléments sont enregistrés.'} Statut :{' '}
          {STATUT_LABEL[saisie.status].toLowerCase()}.
        </div>
      )}

      {salarie.profil === 'vacataire' && (
        <Card className="mb-5 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold text-navy">Mes missions du mois</h2>
            <p className="text-sm text-navy">
              Total validé : <strong>{money(net)}</strong> <span className="text-xs text-muted">net</span>
            </p>
          </div>
          {missions.length ? (
            <ul className="mt-3 divide-y divide-line/60 text-sm">
              {missions.map((l) => (
                <li key={l.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span className="text-navy/80">
                    {formatDate(l.date)} — {l.detail}
                  </span>
                  <span className={estAcquise(l.status) || l.status === 'invoiced' ? 'text-navy' : 'text-amber-700'}>
                    {money(l.total)} {estAcquise(l.status) || l.status === 'invoiced' ? '' : '· en attente du manager'}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">Aucune mission déclarée pour ce mois.</p>
          )}
          <Link href="/missions/new" className="mt-3 inline-block text-sm font-medium text-gold-dark hover:underline">
            Déclarer une mission
          </Link>
        </Card>
      )}

      <Card className="p-5">
        {modifiable ? (
          <ElementsForm
            period={period}
            existant={saisie}
            precedent={avant ? { transport: Boolean(avant.transport), transport_amount: avant.transport_amount === null ? null : Number(avant.transport_amount) } : null}
            vacataire={salarie.profil === 'vacataire'}
          />
        ) : (
          <p className="flex items-center gap-2 text-sm text-navy/80">
            <Lock size={15} />
            {saisie?.status === 'valide' || saisie?.status === 'transmis'
              ? 'Ce mois est validé par l’équipe paie.'
              : 'La saisie de ce mois est close.'}{' '}
            Pour une correction, écrivez à l’équipe paie depuis vos messages.
          </p>
        )}
      </Card>

      <p className="mt-4 text-xs text-muted">
        Ces informations servent uniquement à établir votre bulletin de salaire. Elles sont vues par l’équipe paie.
      </p>
    </>
  )
}
