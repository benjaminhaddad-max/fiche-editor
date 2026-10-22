import type { BrandConfig } from '@/lib/brand'

/**
 * Repeint l'interface aux couleurs de la marque affichée.
 *
 * Les couleurs vivent dans des variables CSS que toute l'application
 * utilise — `bg-navy`, `text-gold`, `bg-cream` compilent vers elles. Elles
 * étaient écrites une fois pour toutes dans globals.css, aux teintes de
 * Diploma : Medibox et Linova s'affichaient donc en bleu nuit et or, et
 * Nolwenn a ouvert son espace en demandant pourquoi c'était « la mise en
 * page Diploma ».
 *
 * Une marque qui ne déclare pas de couleurs garde celles de la feuille de
 * style. Rien ne change pour qui n'a rien demandé.
 */
export function CouleursMarque({ marque }: { marque: BrandConfig }) {
  if (!marque.ui) return null
  const regles = Object.entries(marque.ui)
    .map(([nom, valeur]) => `${nom}:${valeur}`)
    .join(';')
  return <style>{`:root{${regles}}`}</style>
}
