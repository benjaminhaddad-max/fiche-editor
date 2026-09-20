import Link from 'next/link'
import { clsx } from 'clsx'

export interface TabItem {
  key: string
  label: string
  href: string
  count?: number
}

/**
 * Onglets en liens : chaque onglet a son adresse, on peut le partager ou
 * revenir dessus avec « précédent ».
 *
 * Deux teintes : `dark` dans le bandeau navy du titre de page, `light` sur
 * fond crème pour les rangées d'onglets secondaires.
 */
export function Tabs({
  items,
  current,
  tone = 'light',
}: {
  items: TabItem[]
  current: string
  tone?: 'light' | 'dark'
}) {
  const sombre = tone === 'dark'
  return (
    <div
      className={clsx(
        'flex flex-wrap gap-1',
        sombre ? 'border-b border-white/10' : 'mb-6 border-b border-line'
      )}
    >
      {items.map((t) => {
        const actif = t.key === current
        return (
          <Link
            key={t.key}
            href={t.href}
            className={clsx(
              '-mb-px flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm transition-colors',
              sombre
                ? actif
                  ? 'border-gold font-semibold text-cream'
                  : 'border-transparent text-cream/55 hover:border-cream/25 hover:text-cream'
                : actif
                  ? 'border-navy font-semibold text-navy'
                  : 'border-transparent text-navy/60 hover:border-line hover:text-navy'
            )}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span
                className={clsx(
                  'rounded-full px-1.5 py-px text-[11px] font-semibold',
                  sombre
                    ? actif
                      ? 'bg-gold text-navy'
                      : 'bg-white/10 text-cream/70'
                    : actif
                      ? 'bg-navy text-cream'
                      : 'bg-cream-deep text-navy/70'
                )}
              >
                {t.count}
              </span>
            )}
          </Link>
        )
      })}
    </div>
  )
}
