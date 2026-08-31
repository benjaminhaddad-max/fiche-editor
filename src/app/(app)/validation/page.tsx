import { Clock } from 'lucide-react'
import { EmptyState, PageHeader } from '@/components/ui/Page'
import { ValidationTable } from '@/components/validation/ValidationTable'
import { requireRole } from '@/lib/auth'
import { money } from '@/lib/format'
import { getMissionsByStatus } from '@/lib/missions'

export default async function ValidationPage() {
  const user = await requireRole('manager', 'admin')

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
            <p className="mb-4 text-sm text-slate-600">
              {missions.length} prestation{missions.length > 1 ? 's' : ''} ·{' '}
              <span className="font-semibold text-slate-900">
                {money(missions.reduce((s, m) => s + m.total_ht, 0))} HT
              </span>
            </p>
            <ValidationTable missions={missions} />
          </>
        )}
      </>
    )
  }

  const [awaitingAdmin, awaitingManager] = await Promise.all([
    getMissionsByStatus(['manager_approved']),
    getMissionsByStatus(['submitted']),
  ])

  return (
    <>
      <PageHeader
        title="Prestations à valider"
        description="Validation finale avant que le prestataire puisse générer sa facture."
      />

      <section className="mb-10">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-slate-900">
            Validées par le manager — en attente de vous
          </h2>
          {awaitingAdmin.length > 0 && (
            <span className="text-sm text-slate-600">
              {awaitingAdmin.length} ·{' '}
              <span className="font-semibold text-slate-900">
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
          <Clock size={15} className="text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-900">
            En attente du manager
          </h2>
        </div>
        <p className="mb-3 text-xs text-slate-500">
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
