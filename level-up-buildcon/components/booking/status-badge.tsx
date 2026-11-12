import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const INSTALLMENT_TONES: Record<string, string> = {
  Paid: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  'Partially Paid': 'border-amber-200 bg-amber-50 text-amber-800',
  Due: 'border-blue-200 bg-blue-50 text-blue-800',
  Overdue: 'border-red-200 bg-red-50 text-red-700',
  'Not Due': 'border-zinc-200 bg-zinc-50 text-zinc-600',
}

/** Not Due, Due, Partially Paid, Paid, Overdue. */
export function InstallmentStatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge variant="outline" className={cn('whitespace-nowrap font-medium', INSTALLMENT_TONES[status] || INSTALLMENT_TONES['Not Due'], className)}>
      {status}
    </Badge>
  )
}

const BOOKING_TONES: Record<string, { label: string; className: string }> = {
  SUBMITTED: { label: 'Submitted', className: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  EDITED: { label: 'Edited', className: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  PENDING: { label: 'Awaiting approval', className: 'border-amber-200 bg-amber-50 text-amber-800' },
  DRAFT: { label: 'Draft', className: 'border-zinc-300 bg-white text-zinc-600' },
}

export function BookingStatusBadge({ status, className }: { status: string; className?: string }) {
  const tone = BOOKING_TONES[status] || { label: status, className: 'border-zinc-200 bg-zinc-50 text-zinc-600' }
  return (
    <Badge variant="outline" className={cn('whitespace-nowrap font-medium', tone.className, className)}>
      {tone.label}
    </Badge>
  )
}

export type PaymentStanding = 'Paid' | 'Overdue' | 'Due' | 'Up to date' | 'Not started'

const PAYMENT_TONES: Record<PaymentStanding, string> = {
  Paid: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  Overdue: 'border-red-200 bg-red-50 text-red-700',
  Due: 'border-blue-200 bg-blue-50 text-blue-800',
  'Up to date': 'border-zinc-200 bg-zinc-50 text-zinc-700',
  'Not started': 'border-zinc-200 bg-white text-zinc-500',
}

export function PaymentStandingBadge({ standing, className }: { standing: PaymentStanding; className?: string }) {
  return (
    <Badge variant="outline" className={cn('whitespace-nowrap font-medium', PAYMENT_TONES[standing], className)}>
      {standing}
    </Badge>
  )
}

/** Plain-language payment position for a booking, from the same ledger totals everywhere. */
export function paymentStanding(input: { outstandingPaise: bigint; overduePaise: bigint; dueNowPaise: bigint; receivedTotalPaise: bigint }): PaymentStanding {
  if (input.outstandingPaise <= 0n) return 'Paid'
  if (input.overduePaise > 0n) return 'Overdue'
  if (input.dueNowPaise > 0n) return 'Due'
  if (input.receivedTotalPaise > 0n) return 'Up to date'
  return 'Not started'
}
