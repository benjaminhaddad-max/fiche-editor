import { clsx } from 'clsx'
import { brand } from '@/lib/brand'
import { LogoLinova } from '@/components/ui/LogoLinova'

/**
 * La marque du déploiement.
 *
 * Les deux écoles la traitent différemment, parce que leurs chartes ne
 * disent pas la même chose.
 *
 * Diploma : le fichier est fabriqué par scripts/marque à partir du logo de
 * Diploma Lab. Le mot « Diploma » garde ses pixels d'origine, « Invoice »
 * est composé à la même hauteur de capitale et à la même graisse.
 *
 * Linova : rien n'est fabriqué. La charte interdit de déformer le logo et
 * de « changer la graisse ou la casse de la typographie », donc on ne
 * recompose pas le logotype : on le pose tel quel, en vectoriel, et on
 * écrit « Invoice » à côté en texte vivant — exactement le verrouillage que
 * Linova Lab emploie pour son « Lab », au même rapport de taille, à la même
 * graisse fine et au même interlettrage.
 */
const RATIO_DIPLOMA = 720 / 243

/** Proportions relevées sur le verrouillage « Lab » de Linova Lab. */
const LINOVA = {
  logo: 0.6,        // le logotype occupe 60 % de la hauteur totale
  gap: 0.07,        // gouttière, mesurée entre le logotype et le mot
  mot: 0.28,        // corps du second mot, un peu plus de la moitié du logo
  tracking: '0.38em',
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

  if (marque.id === 'linova') {
    return (
      <div
        className={clsx('flex select-none flex-col items-start', className)}
        style={{
          color: tone === 'light' ? marque.palette.light : marque.palette.dark,
          gap: hauteur * LINOVA.gap,
        }}
        aria-label={marque.appTitle}
      >
        <LogoLinova className="w-auto" style={{ height: hauteur * LINOVA.logo }} />
        <span
          className="font-light uppercase leading-none"
          style={{ fontSize: hauteur * LINOVA.mot, letterSpacing: LINOVA.tracking }}
        >
          Invoice
        </span>
      </div>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={tone === 'light' ? marque.logos.cream : marque.logos.navy}
      alt={marque.appTitle}
      width={Math.round(hauteur * RATIO_DIPLOMA)}
      height={hauteur}
      draggable={false}
      className={clsx('block w-auto select-none', className)}
      style={{ height: hauteur }}
    />
  )
}
