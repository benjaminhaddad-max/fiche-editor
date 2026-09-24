import { clsx } from 'clsx'
import { Tabs, type TabItem } from '@/components/ui/Tabs'

/**
 * Bandeau de titre, repris de Diploma Lab : un pavé navy en dégradé, coins
 * inférieurs arrondis, qui déborde des marges de la page et se fond dans le
 * crème en bas. Les onglets vivent dedans, sur une rangée assombrie — c'est
 * ce qui donne à chaque page un vrai titre au lieu d'un texte posé.
 */
export function PageHeader({
  title,
  description,
  actions,
  tabs,
  currentTab,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
  /** Onglets de la page, affichés dans le bandeau. */
  tabs?: TabItem[]
  currentTab?: string
}) {
  return (
    <div className="ds-panel-header-slot -mx-4 -mt-6 mb-7 sm:-mx-8 sm:-mt-8">
      <div className="ds-panel-header">
        <div className="ds-panel-header__body flex flex-wrap items-start justify-between gap-4 px-4 pb-5 pt-7 sm:px-8 sm:pb-6 sm:pt-9">
          <div className="min-w-0">
            {/* Fraunces monte haut : un interligne serré dans un bloc qui
                rogne ce qui dépasse coupait le haut des capitales. */}
            <h1 className="font-display text-[22px] font-semibold leading-[1.35] sm:text-[28px] tracking-tight text-cream">
              {title}
            </h1>
            {description && <p className="mt-1.5 max-w-3xl text-sm text-cream/65">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
        {tabs && tabs.length > 0 && (
          <div className="ds-panel-header__tabs overflow-x-auto px-4 pt-1 sm:px-8">
            <Tabs items={tabs} current={currentTab ?? tabs[0].key} tone="dark" />
          </div>
        )}
      </div>
    </div>
  )
}

export function Card({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={clsx(
        'rounded-xl border border-line bg-white shadow-[0_1px_2px_rgba(14,30,53,0.04)]',
        className
      )}
    >
      {children}
    </div>
  )
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line bg-white px-6 py-16 text-center">
      <p className="font-display text-base font-semibold text-navy">{title}</p>
      {description && (
        <p className="mt-1 max-w-md text-sm text-muted">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function StatTile({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub?: string
  accent?: 'brand' | 'amber' | 'emerald' | 'slate'
}) {
  return (
    <div className="rounded-xl border border-line bg-white p-5 shadow-[0_1px_2px_rgba(14,30,53,0.04)]">
      <p className="ds-eyebrow">{label}</p>
      <p
        className={clsx('font-display mt-2 text-[26px] font-semibold', {
          'text-gold-dark': accent === 'brand',
          'text-amber-700': accent === 'amber',
          'text-emerald-700': accent === 'emerald',
          'text-navy': !accent || accent === 'slate',
        })}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </div>
  )
}
