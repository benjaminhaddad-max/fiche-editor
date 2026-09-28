import { clsx } from 'clsx'
import { brand } from '@/lib/brand'

/**
 * La marque du déploiement.
 *
 * Aucun des deux fichiers n'est dessiné ici : ils sont fabriqués par
 * scripts/marque, à partir du logo officiel de l'école. Le mot de la marque
 * en garde les pixels d'origine — coche verte comprise pour Linova — et seul
 * « Invoice » est composé, à la graisse et à la largeur de la ligne du
 * dessus. Les plateformes portent donc littéralement la marque de l'école.
 *
 * Deux versions par marque, à fond transparent : claire pour les fonds
 * foncés, foncée pour les fonds clairs.
 */
const RATIO: Record<string, number> = {
  diploma: 720 / 243,
  linova: 2309 / 1161,
}

export function Logo({
  className,
  tone = 'navy',
  size = 'md',
}: {
  className?: string
  /** `light` sur fond navy, `navy` sur fond clair. */
  tone?: 'navy' | 'light'
  size?: 'sm' | 'md' | 'rail' | 'lg'
}) {
  const hauteur = { sm: 32, md: 48, rail: 60, lg: 92 }[size]
  const marque = brand()
  const fichier = tone === 'light' ? marque.logos.cream : marque.logos.navy
  const ratio = RATIO[marque.id] ?? RATIO.diploma

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={fichier}
      alt={marque.appTitle}
      width={Math.round(hauteur * ratio)}
      height={hauteur}
      draggable={false}
      className={clsx('block w-auto select-none', className)}
      style={{ height: hauteur }}
    />
  )
}
