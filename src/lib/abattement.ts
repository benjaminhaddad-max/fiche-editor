import type { Pole } from '@/lib/types'

/**
 * Le taux réellement retenu sur une prestation.
 *
 * Un salarié touche le montant convenu diminué d'un pourcentage, parce que
 * le contrat porte des charges que l'auto-entreprise n'a pas. Mais l'accord
 * passé avec quelqu'un peut exempter un métier précis : Danial garde
 * l'intégralité de son coaching, et rien d'autre.
 *
 * L'exemption se décide par pôle, pas par catégorie : c'est le métier
 * exercé qui la justifie, pas la ligne comptable sur laquelle il tombe.
 */
export interface FicheAbattement {
  pay_abatement?: number | null
  abatement_exempt_poles?: string[] | null
}

export function tauxAbattement(fiche: FicheAbattement, pole: Pole | null | undefined): number {
  const taux = Number(fiche.pay_abatement ?? 0)
  if (!taux) return 0
  if (pole && (fiche.abatement_exempt_poles ?? []).includes(pole)) return 0
  return taux
}

/** Ce qui sera réellement versé, une fois l'abattement retiré. */
export function montantVerse(brut: number, taux: number): number {
  return Math.round(brut * (1 - taux / 100) * 100) / 100
}
