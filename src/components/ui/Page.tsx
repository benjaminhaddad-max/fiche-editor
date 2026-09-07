import { clsx } from 'clsx'

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="font-display text-[26px] font-semibold tracking-tight text-navy">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
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
