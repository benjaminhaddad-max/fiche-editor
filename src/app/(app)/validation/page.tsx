import { Suspense } from 'react'
import { Clock } from 'lucide-react'
import { EmptyState, PageHeader } from '@/components/ui/Page'
import { ValidationTable } from '@/components/validation/ValidationTable'
import { requireRole } from '@/lib/auth'
import { money } from '@/lib/format'
import { getMissionsByStatus } from '@/lib/missions'
import { ManagerPicker } from '@/components/validation/ManagerPicker'
import { getManagers } from '@/lib/queries'

export default async function ValidationPage({
  searchParams,
}: {
  searchParams: Promise<{ manager?: string }>
}) {
  const user = await requireRole('manager', 'admin')
  const { manager } = await searchParams

  if (user.role === 'manager') {
    const missions = await getMissionsByStatus(['submitted'], { managerId: user.id })
    return (
      <>
        <PageHeader
          title="Prestations à valider"
          description="Les prestations déclarées par vos prestataires, en attente de votre accord."
        />
        {missions.length === 0 ? (
          <EmptyState
            title="Rien à valider"
            description="Aucune prestation ne vous est soumise pour le moment."
          />
        ) : (
          <>
            <p className="mb-4 text-sm text-navy/70">
              {missions.length} prestation{missions.length > 1 ? 's' : ''} ·{' '}
              <span className="font-semibold text-navy">
                {money(missions.reduce((s, m) => s + m.total_ht, 0))} HT
              </span>
            </p>
            <ValidationTable missions={missions} />
          </>
        )}
      </>
    )
  }

  // Par défaut on montre ce qui est rattaché à l'administrateur connecté,
  // mais on signale toujours combien de lignes vivent ailleurs : personne ne
  // doit rater une prestation parce qu'un filtre la masquait.
  const choix = manager ?? user.id
  const filtre = choix === 'tous' ? {} : { managerId: choix }

  const [awaitingAdmin, awaitingManager, tousAdmin, tousManager, managers] =
    await Promise.all([
      getMissionsByStatus(['manager_approved'], filtre),
      getMissionsByStatus(['submitted'], filtre),
      getMissionsByStatus(['manager_approved']),
      getMissionsByStatus(['submitted']),
      getManagers(),
    ])

  const ailleurs =
    tousAdmin.length + tousManager.length - awaitingAdmin.length - awaitingManager.length

  return (
    <>
      <PageHeader
        title="Prestations à valider"
        description="Validation finale avant que le prestataire puisse générer sa facture."
      />

      <Suspense fallback={null}>
        <ManagerPicker managers={managers} value={choix} ailleurs={ailleurs} />
      </Suspense>

      <section className="mb-10">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-navy">
            Validées par le manager — en attente de vous
          </h2>
          {awaitingAdmin.length > 0 && (
            <span className="text-sm text-navy/70">
              {awaitingAdmin.length} ·{' '}
              <span className="font-semibold text-navy">
                {money(awaitingAdmin.reduce((s, m) => s + m.total_ht, 0))} HT
              </span>
            </span>
          )}
        </div>
        {awaitingAdmin.length === 0 ? (
          <EmptyState title="Rien en attente de votre validation" />
        ) : (
          <ValidationTable missions={awaitingAdmin} showManager />
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <Clock size={15} className="text-stone" />
          <h2 className="text-sm font-semibold text-navy">
            En attente du manager
          </h2>
        </div>
        <p className="mb-3 text-xs text-muted">
          Vous pouvez valider directement : les deux étapes seront cochées d’un coup.
        </p>
        {awaitingManager.length === 0 ? (
          <EmptyState title="Aucune prestation en attente côté manager" />
        ) : (
          <ValidationTable missions={awaitingManager} showManager />
        )}
      </section>
    </>
  )
}
