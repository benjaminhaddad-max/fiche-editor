/**
 * Type d'intervenant — le métier principal d'une personne (Nolwenn,
 * 19/11/2026) : prof, tuteur, coach, commercial, autre. Un champ de la fiche
 * (`inv_providers.intervenant_type`), et non plus un mot dans les étiquettes.
 * Il sert à filtrer l'équipe, à l'échéancier tuteurs/coachs et à lancer les
 * bordereaux d'un seul groupe.
 *
 * Fichier sans dépendance : les tests le lisent tel quel.
 */

export type Intervenant = 'professeur' | 'tuteur' | 'coach' | 'commercial' | 'autre'

export const INTERVENANTS: readonly Intervenant[] = ['professeur', 'tuteur', 'coach', 'commercial', 'autre']

export const INTERVENANT_LABEL: Record<Intervenant, string> = {
  professeur: 'Prof',
  tuteur: 'Tuteur',
  coach: 'Coach',
  commercial: 'Commercial',
  autre: 'Autre',
}

export const INTERVENANT_PLURIEL: Record<Intervenant, string> = {
  professeur: 'Profs',
  tuteur: 'Tuteurs',
  coach: 'Coachs',
  commercial: 'Commerciaux',
  autre: 'Autres',
}

/** « sans type » : fiche pas encore classée. */
export const SANS_TYPE = 'aucun'

export function estIntervenant(v: unknown): v is Intervenant {
  return typeof v === 'string' && (INTERVENANTS as readonly string[]).includes(v)
}

/** Les groupes cochés dans un formulaire ; vide = tout le monde. */
export function groupesDepuis(valeurs: readonly unknown[]): (Intervenant | typeof SANS_TYPE)[] {
  return valeurs.filter(
    (v): v is Intervenant | typeof SANS_TYPE => estIntervenant(v) || v === SANS_TYPE
  )
}

/** La personne fait-elle partie des groupes choisis ? Aucun groupe = oui. */
export function dansLesGroupes(
  type: string | null | undefined,
  groupes: readonly string[] | null | undefined
): boolean {
  if (!groupes || groupes.length === 0) return true
  return groupes.includes(type && estIntervenant(type) ? type : SANS_TYPE)
}
