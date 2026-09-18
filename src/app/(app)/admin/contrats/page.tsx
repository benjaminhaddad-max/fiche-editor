import Link from 'next/link'
import { ContractTile } from '@/components/contracts/ContractTile'
import { ModeleContractForm } from '@/components/contracts/ModeleContractForm'
import { NewContractForm } from '@/components/contracts/NewContractForm'
import { Card, EmptyState, PageHeader, StatTile } from '@/components/ui/Page'
import { Tabs } from '@/components/ui/Tabs'
import { requireRole } from '@/lib/auth'
import { todayParis } from '@/lib/cycle'
import { CONTRACT_SELECT, type ContractRow } from '@/lib/contracts'
import { money } from '@/lib/format'
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
          <Link href={lien(courant, 'nouveau')} className="inline-flex items-center rounded-lg bg-navy px-4 py-2 text-sm font-medium text-cream hover:bg-navy-light">
            Nouveau contrat
          </Link>
        }
      />

      <Tabs
        current={courant}
        items={[
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
      ) : courant === 'tous' ? (
        POLES.filter((p) => liste.some((c) => c.contract_type === p)).map((p) => {
          const duPole = liste.filter((c) => c.contract_type === p)
          return (
            <section key={p} className="mb-8">
              <div className="mb-3 flex items-baseline justify-between">
                <Link href={`/admin/contrats?pole=${p}`} className="text-sm font-semibold text-navy hover:underline">
                  {POLE_LABEL[p]}
                  <span className="ml-2 font-normal text-muted">{duPole.length}</span>
                </Link>
                <span className="text-sm text-navy/70">
                  {money(duPole.reduce((s, c) => s + Number(c.total_ht), 0))}
                </span>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {duPole.map((c) => (
                  <ContractTile key={c.id} c={c} showProvider />
                ))}
              </div>
            </section>
          )
        })
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {liste.map((c) => (
            <ContractTile key={c.id} c={c} showProvider />
          ))}
        </div>
      )}
    </>
  )
}
