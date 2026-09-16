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
 */
export function Tabs({ items, current }: { items: TabItem[]; current: string }) {
  return (
    <div className="mb-6 flex flex-wrap gap-1 border-b border-line">
      {items.map((t) => {
        const actif = t.key === current
        return (
          <Link
            key={t.key}
            href={t.href}
            className={clsx(
              '-mb-px flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm transition-colors',
              actif
                ? 'border-navy font-semibold text-navy'
                : 'border-transparent text-navy/60 hover:border-line hover:text-navy'
            )}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span
                className={clsx(
                  'rounded-full px-1.5 py-px text-[11px] font-semibold',
                  actif ? 'bg-navy text-cream' : 'bg-cream-deep text-navy/70'
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
