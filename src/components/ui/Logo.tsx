import { clsx } from 'clsx'

/**
 * Marque Diploma Invoice.
 *
 * Le fichier n'est pas dessiné ici : il est fabriqué à partir du logo de
 * Diploma Lab (`logo-diploma-lab-header` dans EXOTEACHBIS). Le symbole et le
 * mot « Diploma » en sont les pixels d'origine, découpés tels quels ; seul
 * « Invoice » est composé, à la même hauteur de capitale, à la même graisse
 * et au même interlettrage que la ligne du dessus. Les deux plateformes
 * portent donc littéralement la même marque.
 *
 * Deux versions, à fond transparent : crème pour les fonds foncés, navy pour
 * les fonds clairs. Le rapport hauteur/largeur est celui du fichier.
 */
const RATIO = 720 / 243

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
  const fichier = tone === 'light' ? '/logo-diploma-invoice.webp' : '/logo-diploma-invoice-navy.webp'

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={fichier}
      alt="Diploma Invoice"
      width={Math.round(hauteur * RATIO)}
      height={hauteur}
      draggable={false}
      className={clsx('block w-auto select-none', className)}
      style={{ height: hauteur }}
    />
  )
}
