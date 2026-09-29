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
      { key: 'elements', label: 'Éléments de paie', href: `/remunerations?vue=elements&${m}` },
      { key: 'historique', label: 'Historique', href: '/validation/historique' },
    ]
  }

  return [
    { key: 'a-valider', label: 'À valider', href: '/validation', count: aValider },
    { key: 'bordereaux', label: 'Bordereaux', href: '/validation/bordereaux' },
    { key: 'factures', label: 'Factures', href: `/remunerations?vue=factures&${m}` },
    { key: 'elements', label: 'Éléments de paie', href: `/remunerations?vue=elements&${m}` },
    { key: 'social', label: 'Au social', href: `/remunerations?vue=social&${m}` },
    { key: 'bulletins', label: 'Bulletins', href: `/remunerations?vue=bulletins&${m}` },
    { key: 'mois', label: 'Ce mois-ci', href: `/remunerations?${m}` },
    { key: 'historique', label: 'Historique', href: '/validation/historique' },
  ]
}
