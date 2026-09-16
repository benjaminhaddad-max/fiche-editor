import Link from 'next/link'
import { ContractCard } from '@/components/contracts/ContractCard'
import { NewContractForm } from '@/components/contracts/NewContractForm'
import { Card, EmptyState, PageHeader, StatTile } from '@/components/ui/Page'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { Tabs } from '@/components/ui/Tabs'
import { requireRole } from '@/lib/auth'
import { CONTRACT_SELECT, type ContractRow } from '@/lib/contracts'
import { money } from '@/lib/format'
import { POLE_LABEL } from '@/lib/labels'
import { getActiveProviders, getManagers } from '@/lib/queries'
import { createServerSupabase } from '@/lib/supabase/server'
import { POLES, type Pole } from '@/lib/types'
import { changerStatutContrat } from './actions'

export default async function ContratsPage({
  searchParams,
}: {
  searchParams: Promise<{ pole?: string; nouveau?: string; archives?: string }>
}) {
  const { pole, nouveau, archives } = await searchParams
  await requireRole('admin')
  const supabase = await createServerSupabase()
  const [{ data }, providers, managers] = await Promise.all([
    supabase.from('inv_coaching_contracts').select(CONTRACT_SELECT).order('created_at', { ascending: false }),
    getActiveProviders(),
    getManagers(),
  ])
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
          <NewContractForm providers={providers} managers={managers} defaultPole={courant === 'tous' ? 'professeur' : courant} />
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
        <div className="flex flex-col gap-3">
          {liste.map((c) => (
            <ContractCard
              key={c.id}
              c={c}
              showProvider
              footer={
                <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
                  <Link href={`/admin/contrats/${c.id}`} className="mr-auto font-medium text-gold-dark hover:underline">
                    Détail et échéancier
                  </Link>
                  <form action={changerStatutContrat}>
                    <input type="hidden" name="contract_id" value={c.id} />
                    <input type="hidden" name="status" value={c.status === 'active' ? 'ended' : 'active'} />
                    <SubmitButton size="sm" variant="ghost" pendingLabel="…">
                      {c.status === 'active' ? 'Terminer le contrat' : 'Réactiver'}
                    </SubmitButton>
                  </form>
                </div>
              }
            />
          ))}
        </div>
      )}
    </>
  )
}
