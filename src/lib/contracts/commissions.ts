/**
 * Grille de commissionnement de la cellule commerciale.
 *
 * Reprise telle quelle de la grille de septembre 2026. Closer et télépro
 * touchent les mêmes montants ; ce qui change d'un profil à l'autre, c'est la
 * rémunération de base et le fait que la grille soit fixe (alternants) ou
 * variable, renégociable selon les performances (freelances).
 */
export interface LigneGrille {
  formation: string
  montant: number | null
}

export interface Grille {
  cle: string
  titre: string
  precision: string
  lignes: LigneGrille[]
}

export const GRILLES: Grille[] = [
  {
    cle: 'sortants',
    titre: 'Leads sortants',
    precision: 'Thotis, Nomad, formulaires, webinaires, JPO, bouche-à-oreille, parrainage, recommandation',
    lignes: [
      { formation: 'PAES présentiel', montant: 200 },
      { formation: 'PASS / PAES distanciel / LAS / P-1', montant: 150 },
      { formation: 'Medibox / Edumove / Linova', montant: 150 },
      { formation: 'P-2', montant: 100 },
      { formation: 'LSPS2', montant: null },
      { formation: 'LSPS3', montant: null },
    ],
  },
  {
    cle: 'candidatures',
    titre: 'Leads candidatures',
    precision: 'Grille fixe des alternants',
    lignes: [
      { formation: 'PAES présentiel', montant: 150 },
      { formation: 'PASS / PAES distanciel / LAS / P-1', montant: 100 },
      { formation: 'Medibox / Edumove / Linova', montant: 100 },
      { formation: 'LSPS2', montant: 50 },
      { formation: 'LSPS3', montant: 50 },
      { formation: 'P-2', montant: 50 },
    ],
  },
  {
    cle: 'reinscriptions',
    titre: 'Leads réinscriptions',
    precision: 'Montant unique de 100 € par réinscription',
    lignes: [
      { formation: 'Réinscription P-2 vers P-1', montant: 100 },
      { formation: 'Réinscription Terminale Santé vers PASS', montant: 100 },
      { formation: 'Réinscription PAES vers PASS', montant: 100 },
      { formation: 'Réinscription LSPS1 vers LSPS2', montant: 100 },
      { formation: 'Réinscription LSPS2 vers LSPS3', montant: 100 },
    ],
  },
]

/** La grille en texte, pour l'annexe du contrat. */
export function grilleEnTexte(): string[] {
  return GRILLES.flatMap((g) => [
    `${g.titre} — ${g.precision} :`,
    ...g.lignes.map(
      (l) => `    • ${l.formation} : ${l.montant === null ? 'non commissionné' : `${l.montant} € par inscription`}`
    ),
  ])
}
