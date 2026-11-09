import { redirect } from 'next/navigation'
import { VueBulletins } from '@/components/remunerations/VueMois'
import { ongletsSocial } from '@/components/social/onglets'
import { FlecheMois } from '@/components/ui/FlecheMois'
import { PageHeader } from '@/components/ui/Page'
import { activeCycle, cycleForMonth, nextCycle, previousCycle } from '@/lib/cycle'
import { requireEquipeSocial } from '@/lib/social/parametres'

/** Les bulletins reçus de Net Paye, classés dans l'espace de chacun. Administration seulement. */
export default async function BulletinsSocialPage({ searchParams }: { searchParams: Promise<{ mois?: string }> }) {
  const user = await requireEquipeSocial()
  if (user.role !== 'admin') redirect('/social')
  const { mois } = await searchParams
  const cycle = mois && /^\d{4}-\d{2}$/.test(mois) ? cycleForMonth(mois) : activeCycle()
  return (
    <>
      <PageHeader title="Espace Social" description="Les bulletins de paie du mois." tabs={ongletsSocial(true)} currentTab="bulletins" />
      <div className="mb-5 flex items-center gap-3 text-sm">
        <FlecheMois href={`/social/bulletins?mois=${previousCycle(cycle).month}`} sens="prec" />
        <p className="font-semibold capitalize text-navy">{cycle.label}</p>
        <FlecheMois href={`/social/bulletins?mois=${nextCycle(cycle).month}`} sens="suiv" />
      </div>
      <VueBulletins cycle={cycle} />
    </>
  )
}
