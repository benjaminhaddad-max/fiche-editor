/**
 * Barèmes des enregistreurs de cours, année 2026-2027.
 *
 * Deux grilles selon la fac, et deux cas négociés à part. Les montants sont
 * hors prime de fiabilité et hors missions de renfort ou de remplacement :
 * celles-là se déclarent à la main.
 */
export interface Palier {
  label: string
  /** Durée en heures, pour mémoire. */
  heures: number
  montant: number
}

export interface BaremeEnregistrement {
  cle: string
  nom: string
  /** Ce qui s'affiche sur le contrat et dans la déclaration. */
  resume: string
  paliers: Palier[]
}

export const BAREMES_ENREGISTREMENT: BaremeEnregistrement[] = [
  {
    cle: 'standard',
    nom: 'Barème standard',
    resume: '2 h 25 € · 4 h 35 € · 6 h 50 € · 8 à 10 h 65 €',
    paliers: [
      { label: '2 h', heures: 2, montant: 25 },
      { label: '4 h', heures: 4, montant: 35 },
      { label: '6 h', heures: 6, montant: 50 },
      { label: '8 à 10 h', heures: 9, montant: 65 },
    ],
  },
  {
    cle: 'majore',
    nom: 'Barème majoré',
    resume: '2 h 30 € · 4 h 40 € · 6 h 55 € · 8 à 10 h 70 €',
    paliers: [
      { label: '2 h', heures: 2, montant: 30 },
      { label: '4 h', heures: 4, montant: 40 },
      { label: '6 h', heures: 6, montant: 55 },
      { label: '8 à 10 h', heures: 9, montant: 70 },
    ],
  },
  {
    cle: 'horaire15',
    nom: 'À l’heure',
    resume: '15 € de l’heure',
    paliers: [{ label: '1 h', heures: 1, montant: 15 }],
  },
  {
    cle: 'demi_journee70',
    nom: 'À la demi-journée',
    resume: '70 € la demi-journée',
    paliers: [{ label: 'Demi-journée', heures: 4, montant: 70 }],
  },
]

export const bareme = (cle: string | null | undefined) =>
  BAREMES_ENREGISTREMENT.find((b) => b.cle === cle) ?? null
