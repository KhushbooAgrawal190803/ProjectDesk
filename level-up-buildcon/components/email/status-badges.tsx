import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { DELIVERY_STATUS_LABELS, EVENT_STATUS_LABELS, type DeliveryStatus, type EventStatus } from '@/lib/email/core'

const EVENT_TONES: Record<EventStatus, string> = {
  awaiting_recipients: 'border-amber-200 bg-amber-50 text-amber-800',
  queued: 'border-zinc-200 bg-zinc-50 text-zinc-700',
  processing: 'border-blue-200 bg-blue-50 text-blue-800',
  sent: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  partially_failed: 'border-amber-200 bg-amber-50 text-amber-800',
  failed: 'border-red-200 bg-red-50 text-red-700',
}

const DELIVERY_TONES: Record<DeliveryStatus, string> = {
  queued: 'border-zinc-200 bg-zinc-50 text-zinc-700',
  sending: 'border-blue-200 bg-blue-50 text-blue-800',
  sent: 'border-sky-200 bg-sky-50 text-sky-800',
  delivered: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  delivery_delayed: 'border-amber-200 bg-amber-50 text-amber-800',
  bounced: 'border-red-200 bg-red-50 text-red-700',
  complained: 'border-red-200 bg-red-50 text-red-700',
  failed: 'border-red-200 bg-red-50 text-red-700',
}

export function EmailEventStatusBadge({ status, className }: { status: string; className?: string }) {
  const key = (status in EVENT_TONES ? status : 'queued') as EventStatus
  return <Badge variant="outline" className={cn('whitespace-nowrap font-medium', EVENT_TONES[key], className)}>{EVENT_STATUS_LABELS[key]}</Badge>
}

export function EmailDeliveryStatusBadge({ status, className }: { status: string; className?: string }) {
  const key = (status in DELIVERY_TONES ? status : 'queued') as DeliveryStatus
  return <Badge variant="outline" className={cn('whitespace-nowrap font-medium', DELIVERY_TONES[key], className)}>{DELIVERY_STATUS_LABELS[key]}</Badge>
}
