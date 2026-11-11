import { percentOfPaise, toHundredths } from '@/lib/booking/money'

export const DEMAND_TIMEZONE = 'Asia/Kolkata'
export const DEFAULT_PAYMENT_DAYS = 7
export const DEFAULT_GST_PERCENT = 5
export const DEFAULT_NUMBER_TEMPLATE = 'LUB/{PROJECT}/DN/{UNIT}/{SEQ}/{YEAR}'
export const ACTIVE_BOOKING_STATUSES = ['SUBMITTED', 'EDITED'] as const

const DAY_WORDS = [
  'Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen',
  'Nineteen', 'Twenty', 'Twenty-one', 'Twenty-two', 'Twenty-three', 'Twenty-four',
  'Twenty-five', 'Twenty-six', 'Twenty-seven', 'Twenty-eight', 'Twenty-nine', 'Thirty',
]

export function paymentDayPhrase(days: number): string {
  const word = DAY_WORDS[days]
  return word ? `${days} (${word})` : String(days)
}

/** Local calendar date as YYYY-MM-DD. */
export function todayInTimeZone(now: Date, timeZone = DEMAND_TIMEZONE): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export function addCalendarDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function projectCode(name: string | null | undefined): string {
  const cleaned = (name || '').replace(/[^A-Za-z0-9]+/g, '').toUpperCase()
  return cleaned || 'PROJECT'
}

export function formatDemandNumber(
  template: string,
  parts: { project: string; unit: string; seq: number; year: number }
): string {
  return template
    .replaceAll('{PROJECT}', projectCode(parts.project))
    .replaceAll('{UNIT}', parts.unit.trim())
    .replaceAll('{SEQ}', String(parts.seq).padStart(3, '0'))
    .replaceAll('{YEAR}', String(parts.year))
}

export function sequenceScope(project: string, unit: string, year: number): string {
  return `${projectCode(project)}|${unit.trim()}|${year}`
}

export function installmentGstPaise(principalPaise: bigint, gstPercent = DEFAULT_GST_PERCENT): bigint {
  return percentOfPaise(principalPaise, gstPercent) ?? 0n
}

export interface MoneySplit {
  principal: bigint
  gst: bigint
}

export function subtractSplit(due: MoneySplit, allocated: MoneySplit): MoneySplit {
  return {
    principal: due.principal > allocated.principal ? due.principal - allocated.principal : 0n,
    gst: due.gst > allocated.gst ? due.gst - allocated.gst : 0n,
  }
}

export function splitTotal(value: MoneySplit): bigint {
  return value.principal + value.gst
}

export function hasPositiveOutstanding(value: MoneySplit): boolean {
  return value.principal > 0n || value.gst > 0n
}

/**
 * A construction installment is due only when that project milestone is complete.
 * A dated installment is due on its calendar date in the project timezone, and
 * stays due if a run was missed. The booking date is not an input.
 */
export function isInstallmentDue(input: {
  trigger: 'milestone' | 'date'
  milestoneCompleted: boolean
  dueDate?: string | null
  today: string
}): boolean {
  if (input.trigger === 'date') {
    return Boolean(input.dueDate) && input.dueDate! <= input.today
  }
  return input.milestoneCompleted
}

export interface InstallmentCandidate {
  id: string
  trigger: 'milestone' | 'date'
  linked: boolean
  milestoneCompleted: boolean
  dueDate?: string | null
  principalPaise: bigint
  gstPaise: bigint
  allocatedPrincipalPaise: bigint
  allocatedGstPaise: bigint
  hasDemand: boolean
}

export interface DemandPlan {
  issue: Array<{ id: string; outstanding: MoneySplit }>
  skipped: Array<{ id: string; reason: 'already_issued' | 'not_due' | 'not_linked' | 'settled' | 'nothing_due' }>
}

export function planDemandIssues(rows: InstallmentCandidate[], today: string): DemandPlan {
  const issue: DemandPlan['issue'] = []
  const skipped: DemandPlan['skipped'] = []
  for (const row of rows) {
    if (row.hasDemand) {
      skipped.push({ id: row.id, reason: 'already_issued' })
      continue
    }
    if (!row.linked) {
      skipped.push({ id: row.id, reason: 'not_linked' })
      continue
    }
    if (!isInstallmentDue({ ...row, today })) {
      skipped.push({ id: row.id, reason: 'not_due' })
      continue
    }
    if (row.principalPaise <= 0n && row.gstPaise <= 0n) {
      skipped.push({ id: row.id, reason: 'nothing_due' })
      continue
    }
    const outstanding = subtractSplit(
      { principal: row.principalPaise, gst: row.gstPaise },
      { principal: row.allocatedPrincipalPaise, gst: row.allocatedGstPaise }
    )
    if (!hasPositiveOutstanding(outstanding)) {
      skipped.push({ id: row.id, reason: 'settled' })
      continue
    }
    issue.push({ id: row.id, outstanding })
  }
  return { issue, skipped }
}

export function paymentFitsOutstanding(outstanding: MoneySplit, payment: MoneySplit): string | null {
  if (payment.principal < 0n || payment.gst < 0n) return 'Amounts cannot be negative'
  if (payment.principal === 0n && payment.gst === 0n) return 'Enter a principal amount or a GST amount'
  if (payment.principal > outstanding.principal) return 'Principal is larger than the outstanding installment'
  if (payment.gst > outstanding.gst) return 'GST is larger than the outstanding GST'
  return null
}

export type CollectionStatus = 'not_due' | 'unpaid' | 'partial' | 'paid'

export function collectionStatus(input: {
  due: boolean
  demanded: boolean
  outstanding: MoneySplit
  received: MoneySplit
}): CollectionStatus {
  if (!hasPositiveOutstanding(input.outstanding) && (input.due || input.demanded || splitTotal(input.received) > 0n)) {
    return 'paid'
  }
  if (!input.due && !input.demanded) return 'not_due'
  if (splitTotal(input.received) > 0n) return 'partial'
  return 'unpaid'
}

export function isOverdue(input: {
  demanded: boolean
  outstanding: MoneySplit
  deadline: string | null
  today: string
}): boolean {
  return input.demanded && hasPositiveOutstanding(input.outstanding) && Boolean(input.deadline) && input.today > input.deadline!
}

export function displayStatus(status: CollectionStatus, overdue: boolean): string {
  if (status === 'paid') return 'Paid'
  if (status === 'not_due') return 'Not Due'
  if (overdue) return 'Overdue'
  if (status === 'partial') return 'Partially Paid'
  return 'Unpaid'
}

export function paiseFrom(value: unknown): bigint {
  return toHundredths(value) ?? 0n
}
