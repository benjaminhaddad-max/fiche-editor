import { clsx } from 'clsx'
import {
  INVOICE_STATUS_LABEL,
  INVOICE_STATUS_STYLE,
  MISSION_STATUS_LABEL,
  MISSION_STATUS_STYLE,
} from '@/lib/labels'
import type { InvoiceStatus, MissionStatus } from '@/lib/types'

const base =
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap'

export function Badge({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return <span className={clsx(base, className)}>{children}</span>
}

export function MissionStatusBadge({ status }: { status: MissionStatus }) {
  return <Badge className={MISSION_STATUS_STYLE[status]}>{MISSION_STATUS_LABEL[status]}</Badge>
}

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return <Badge className={INVOICE_STATUS_STYLE[status]}>{INVOICE_STATUS_LABEL[status]}</Badge>
}
