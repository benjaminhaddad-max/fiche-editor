import type { TabItem } from '@/components/ui/Tabs'
import type { Role } from '@/lib/types'

/**
 * Les vues du mois, en un seul jeu d'onglets.
 *
 * « Prestations » et « Rémunérations » étaient deux entrées de menu
 * distinctes, avec chacune ses onglets : on validait d'un côté, on payait
 * de l'autre, sans jamais voir que c'est la même chose à deux moments. Il
 * fallait ressortir du menu pour suivre un montant de bout en bout.
 *
 * L'ordre suit celui du mois : ce qu'on valide, ce qui part, ce qui revient,
 * ce qui va à la paie, et ce que le mois aura coûté. Un manager ne voit que
 * ce qui le concerne — il ne paie personne.
 */
export function ongletsDuMois(role: Role, aValider: number, mois: string): TabItem[] {
  const m = `mois=${mois}`

  if (role === 'manager') {
    return [
      { key: 'a-valider', label: 'À valider', href: '/validation', count: aValider },
      { key: 'bordereaux', label: 'Bordereaux', href: '/validation/bordereaux' },
      { key: 'paie', label: 'Paie', href: `/remunerations?vue=paie&${m}` },
      { key: 'historique', label: 'Historique', href: '/validation/historique' },
    ]
  }

  // Les salariés tenaient trois onglets — éléments variables, envoi au
  // social, bulletins — alors que c'est un seul sujet suivi dans le temps.
  // Ils tiennent en un, avec ses étapes à l'intérieur.
  return [
    { key: 'a-valider', label: 'À valider', href: '/validation', count: aValider },
    { key: 'bordereaux', label: 'Bordereaux', href: '/validation/bordereaux' },
    { key: 'factures', label: 'Factures', href: `/remunerations?vue=factures&${m}` },
    { key: 'paie', label: 'Paie', href: `/remunerations?vue=paie&${m}` },
    { key: 'depenses', label: 'Dépenses', href: `/remunerations?vue=depenses&${m}` },
    { key: 'mois', label: 'Ce mois-ci', href: `/remunerations?${m}` },
    { key: 'historique', label: 'Historique', href: '/validation/historique' },
  ]
}
