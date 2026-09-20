import Link from 'next/link'
import { ContractRows, type LigneContrat } from '@/components/contracts/ContractRows'
import { ModeleContractForm } from '@/components/contracts/ModeleContractForm'
import { NewContractForm } from '@/components/contracts/NewContractForm'
import { Card, EmptyState, PageHeader, StatTile } from '@/components/ui/Page'
import { requireRole } from '@/lib/auth'
import { todayParis } from '@/lib/cycle'
import { CONTRACT_STATUS_LABEL, CONTRACT_SELECT, contractRate, contractTitle, type ContractRow } from '@/lib/contracts'
import { formatDate, formatPeriod, money } from '@/lib/format'
import { POLE_LABEL } from '@/lib/labels'
import { getActiveProviders, getManagers } from '@/lib/queries'
import { createServerSupabase } from '@/lib/supabase/server'
import { POLES, type Pole } from '@/lib/types'

export default async function ContratsPage({
  searchParams,
}: {
  searchParams: Promise<{ pole?: string; nouveau?: string; archives?: string }>
}) {
  const { pole, nouveau, archives } = await searchParams
  const user = await requireRole('manager', 'admin')
  const supabase = await createServerSupabase()
  let requete = supabase.from('inv_coaching_contracts').select(CONTRACT_SELECT).order('created_at', { ascending: false })
  // Un manager suit les contrats dont il est responsable ; l'administration voit tout.
  if (user.role === 'manager') requete = requete.eq('manager_id', user.id)
  const [{ data }, providers, managers] = await Promise.all([requete, getActiveProviders(), getManagers()])
  const tous = (data ?? []) as unknown as ContractRow[]
  const courant = (POLES as string[]).includes(pole ?? '') ? (pole as Pole) : 'tous'
  const actifs = tous.filter((c) => (archives !== undefined ? true : c.status === 'active' || c.status === 'draft'))
  const liste = courant === 'tous' ? actifs : actifs.filter((c) => c.contract_type === courant)

  const echeances = liste.flatMap((c) => c.instalments ?? [])
  const lien = (p: string, extra = '') => `/admin/contrats?${p !== 'tous' ? `pole=${p}&` : ''}${extra}`

  return (
    <>
      <PageHeader
        title="Contrats"
        description="Tous les contrats, pôle par pôle : coaching, professeurs, référents pédagogiques, commercial, marketing, autres."
        actions={
          <Link href={lien(courant, 'nouveau')} className="ds-header-action">
            Nouveau contrat
          </Link>
        }
        currentTab={courant}
        tabs={[
          { key: 'tous', label: 'Tous', href: '/admin/contrats', count: tous.filter((c) => c.status === 'active').length },
          ...POLES.map((p) => ({
            key: p,
            label: POLE_LABEL[p],
            href: `/admin/contrats?pole=${p}`,
            count: tous.filter((c) => c.contract_type === p && c.status === 'active').length,
          })),
        ]}
      />

      {nouveau !== undefined && (
        <Card className="mb-6 p-5">
          <h2 className="mb-1 text-sm font-semibold text-navy">Depuis un modèle</h2>
          <p className="mb-4 text-xs text-muted">
            Le contrat est pré-rempli, envoyé par email, signé en ligne, puis classé ici automatiquement.
          </p>
          <ModeleContractForm providers={providers} managers={managers} today={todayParis()} />

          {user.role === 'admin' && (
            <details className="mt-6 border-t border-line pt-4">
              <summary className="cursor-pointer text-sm font-medium text-navy">
                Saisir un contrat à la main (hors modèle)
              </summary>
              <div className="mt-4">
                <NewContractForm providers={providers} managers={managers} defaultPole={courant === 'tous' ? 'professeur' : courant} />
              </div>
            </details>
          )}
        </Card>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile label="Engagé (forfaits)" value={money(liste.reduce((s, c) => s + Number(c.total_ht), 0))} sub={`${liste.length} contrat(s)`} accent="brand" />
        <StatTile label="Échéances ouvertes" value={money(echeances.filter((e) => e.mission_id).reduce((s, e) => s + Number(e.amount_ht), 0))} accent="emerald" />
        <StatTile label="Reste à venir" value={money(echeances.filter((e) => !e.mission_id).reduce((s, e) => s + Number(e.amount_ht), 0))} />
      </div>

      <p className="mb-3 text-right text-xs">
        <Link href={archives !== undefined ? lien(courant) : lien(courant, 'archives')} className="text-gold-dark hover:underline">
          {archives !== undefined ? 'Masquer les contrats terminés' : 'Afficher aussi les contrats terminés'}
        </Link>
      </p>

      {liste.length === 0 ? (
        <EmptyState title="Aucun contrat ici" description="Créez-en un avec « Nouveau contrat »." />
      ) : (
        <ContractRows lignes={liste.map(enLigne)} grouper={courant === 'tous'} />
      )}
    </>
  )
}

/** Ce qu'une ligne de la liste montre d'un contrat, et rien de plus. */
function enLigne(c: ContractRow): LigneContrat {
  const echeances = c.instalments ?? []
  const signature = c.signed_at ? 'signe' : c.sent_at ? 'envoye' : c.document_path ? 'depose' : 'manquant'
  // Une seule précision par ligne, et seulement quand elle apprend quelque
  // chose : « Déposé » se suffit à lui-même, une date de signature non.
  const detail = c.signed_at
    ? formatDate(c.signed_at)
    : c.sent_at
      ? `le ${formatDate(c.sent_at)}`
      : ''

  return {
    id: c.id,
    personne: c.provider?.legal_name ?? '—',
    intitule: contractTitle(c),
    pole: c.contract_type,
    poleLabel: POLE_LABEL[c.contract_type],
    montant: Number(c.total_ht) || Number(c.rate_amount) || 0,
    base: contractRate(c),
    periode: c.academic_year ? `Année ${c.academic_year}` : formatPeriod(c.start_date, c.end_date),
    echeancesOuvertes: echeances.filter((e) => e.mission_id).length,
    echeancesTotal: echeances.length,
    responsable: c.manager?.full_name ?? '',
    signature,
    signatureDetail: detail,
    statut: c.status,
    statutLabel: c.status === 'active' ? null : (CONTRACT_STATUS_LABEL[c.status] ?? c.status),
  }
}
