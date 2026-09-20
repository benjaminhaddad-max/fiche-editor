import { CalendrierMois } from '@/components/cycle/CalendrierMois'
import { DeclarationForm } from '@/components/missions/DeclarationForm'
import { GrilleCommissions } from '@/components/contracts/GrilleCommissions'

import { PrestationsNav } from '@/components/prestations/PrestationsNav'
import { requireRole } from '@/lib/auth'
import { activeCycle, cycleForDate, todayParis } from '@/lib/cycle'
import { formatDateLong } from '@/lib/format'
import { getActiveProviders, getCategoriesWithPole, getManagers } from '@/lib/queries'
import { baremesParPrestataire } from '@/lib/contracts/baremes'
import { declarer } from '../../declarations/actions'

export default async function DeclarerPourPage() {
  const user = await requireRole('manager', 'admin')
  const [categories, managers, providers, tarifs] = await Promise.all([
    getCategoriesWithPole(),
    getManagers(),
    getActiveProviders(),
    baremesParPrestataire(),
  ])
  const today = todayParis()
  const mois = cycleForDate(today)
  const ouvert = activeCycle(today)

  const texte =
    user.role === 'admin'
      ? 'En tant qu’administrateur, vous pouvez saisir sur n’importe quel mois. Les lignes sont validées d’office.'
      : `Vous pouvez saisir les prestations de ${mois.label} jusqu’au ${formatDateLong(mois.reviewEnd)}. Elles sont validées d’office, puisque c’est vous qui les déclarez.${
          ouvert.month !== mois.month ? ` ${ouvert.label} est clos.` : ''
        }`

  return (
    <>
      <PrestationsNav
        user={user}
        current="declarer"
        description="Déclarez directement les missions de vos prestataires : elles rejoindront leur bordereau du mois."
      />
      <CalendrierMois pour="manager" />
      <DeclarationForm
        action={declarer}
        mode={user.role === 'admin' ? 'admin' : 'manager'}
        categories={categories}
        managers={managers}
        providers={providers}
        tarifs={tarifs}
        defaultManagerId={user.id}
        today={today}
        deadlineText={texte}
      />
      <GrilleCommissions />
    </>
  )
}
