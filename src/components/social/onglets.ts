import type { TabItem } from '@/components/ui/Tabs'

/**
 * Les onglets de l'Espace Social. Rien de commun avec ceux des
 * prestataires : ni facture, ni bordereau ici.
 */
export function ongletsSocial(admin: boolean): TabItem[] {
  return [
    { key: 'mois', label: 'Le mois', href: '/social' },
    { key: 'salaries', label: 'Salariés', href: '/social/salaries' },
    { key: 'missions', label: 'Missions des vacataires', href: '/social/missions' },
    ...(admin ? [{ key: 'bulletins', label: 'Bulletins', href: '/social/bulletins' }] : []),
    { key: 'journal', label: 'Journal', href: '/social/journal' },
    { key: 'parametres', label: 'Paramètres', href: '/social/parametres' },
  ]
}
