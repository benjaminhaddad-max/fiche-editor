import { FormParametres } from '@/components/social/FormParametres'
import { ongletsSocial } from '@/components/social/onglets'
import { PageHeader } from '@/components/ui/Page'
import { lireParametres, requireEquipeSocial } from '@/lib/social/parametres'

/** Le calendrier Social et les codes Silae, réglés ici et nulle part dans le code. */
export default async function ParametresSocialPage() {
  const user = await requireEquipeSocial()
  const p = await lireParametres()
  return (
    <>
      <PageHeader
        title="Espace Social"
        description="Calendrier, codes Silae et destinataire chez Net Paye — modifiables sans redéploiement."
        tabs={ongletsSocial(user.role === 'admin')}
        currentTab="parametres"
      />
      <FormParametres p={p} admin={user.role === 'admin'} />
    </>
  )
}
