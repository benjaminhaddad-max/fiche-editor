import Link from 'next/link'
import { FileUp } from 'lucide-react'
import { DeclarationForm } from '@/components/missions/DeclarationForm'
import { PageHeader } from '@/components/ui/Page'
import { requireProvider } from '@/lib/auth'
import { activeCycle, cycleForDate, providerCanDeclare, todayParis } from '@/lib/cycle'
import { formatDateLong } from '@/lib/format'
import { getCategoriesWithPole, getManagers } from '@/lib/queries'
import { baremesParPrestataire } from '@/lib/contracts/baremes'
import { couvertureParContrat } from '@/lib/contracts/couverture'
import { isSalaried, type Pole } from '@/lib/types'
import { declarer } from '../../declarations/actions'

export default async function NewMissionPage({
  searchParams,
}: {
  searchParams: Promise<{ pole?: Pole }>
}) {
  const { pole } = await searchParams
  const { provider } = await requireProvider()
  const [categories, managers, tarifs, couvertures] = await Promise.all([
    getCategoriesWithPole({ forProvider: true }),
    getManagers(),
    baremesParPrestataire(),
    couvertureParContrat(provider.id),
  ])
  // Le prestataire ne voit que le sien.
  const monTarif = tarifs[provider.id] ? { moi: tarifs[provider.id] } : undefined

  const today = todayParis()
  const mois = cycleForDate(today)
  const precedent = activeCycle(today)
  // Cette phrase disait « vous ne pouvez plus y ajouter de prestation » :
  // c'était faux, et c'est là que les gens renonçaient. On peut encore, en
  // cochant « déclaration tardive » — autant le dire tout de suite.
  const texte = providerCanDeclare(today)
    ? `Prestations de ${mois.label} : à déclarer au plus tard le ${formatDateLong(mois.declarationDeadline)}.`
    : `${mois.label} est en vérification depuis le ${formatDateLong(mois.reviewStart)} : les managers relisent. Vous pouvez encore ajouter une prestation de ${mois.label} en cochant « déclaration tardive » sous sa date — votre manager la verra avec les autres.`

  return (
    <>
      <PageHeader
        title="Déclarer mes prestations"
        description="Une ligne par prestation, comme sur une facture. Ajoutez-en autant que nécessaire."
        actions={
          !isSalaried(provider.employment_type) ? (
            <Link
              href="/factures/deposer"
              className="ds-header-action-ghost"
            >
              <FileUp size={16} />
              Importer depuis une facture PDF
            </Link>
          ) : undefined
        }
      />
      {precedent.month !== mois.month && (
        <p className="mb-4 rounded-lg border border-line bg-white px-4 py-3 text-sm text-navy/80">
          Le bordereau de {precedent.label} est en cours : votre facture est attendue jusqu’au{' '}
          {formatDateLong(precedent.invoiceDeadline)}.
        </p>
      )}
      <DeclarationForm
        action={declarer}
        mode="prestataire"
        categories={categories}
        managers={managers}
        defaultManagerId={provider.default_manager_id}
        defaultPole={pole}
        employment={provider.employment_type}
        tarifs={monTarif}
        couvertures={couvertures}
        sansTva={provider.vat_regime === 'franchise'}
        today={today}
        deadlineText={texte}
      />
    </>
  )
}
