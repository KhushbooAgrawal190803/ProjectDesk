import { CONSTRUCTION_MILESTONES } from '@/lib/demands/milestones'
import { addPaise, flatBasePaise, hundredthsToString, percentOfPaise, toHundredths } from './money'

export const MAIN_PARKING_SPACES = 79
export const SECONDARY_PARKING_SPACES = 27
export const TOTAL_PARKING_SPACES = MAIN_PARKING_SPACES + SECONDARY_PARKING_SPACES

/** Standard construction-linked slabs. Percentages total 100 of Total Consideration (flat + parking). */
export const STANDARD_PAYMENT_SLABS = [
  { sr: 1, percentage: 20, label: '20% at the time of execution of the Agreement' },
  { sr: 2, percentage: 10, label: '10% before casting of Basement slab' },
  { sr: 3, percentage: 10, label: '10% before casting of Ground slab' },
  { sr: 4, percentage: 6, label: '6% before casting of 1st floor slab' },
  { sr: 5, percentage: 6, label: '6% before casting of 2nd floor slab' },
  { sr: 6, percentage: 6, label: '6% before casting of 3rd floor slab' },
  { sr: 7, percentage: 6, label: '6% before casting of 4th floor slab' },
  { sr: 8, percentage: 6, label: '6% before casting of 5th floor slab' },
  { sr: 9, percentage: 5, label: '5% before casting of 6th floor slab' },
  { sr: 10, percentage: 5, label: '5% before casting of 7th floor slab' },
  { sr: 11, percentage: 5, label: '5% before casting of 8th floor slab' },
  { sr: 12, percentage: 5, label: '5% before casting of 9th floor slab' },
  { sr: 13, percentage: 5, label: '5% before casting of 10th floor slab' },
  { sr: 14, percentage: 5, label: '5% at the time of Handover/ Registry of flat' },
] as const

export type ScheduleTrigger = 'milestone' | 'date'
export type ScheduleCalc = 'percentage' | 'fixed'

export interface ScheduleRowInput {
  id?: string
  trigger_type: ScheduleTrigger
  label?: string | null
  milestone_code?: string | null
  milestone_date?: string | null
  calc_type: ScheduleCalc
  value?: number | string | null
}

export interface ResolvedScheduleRow {
  trigger_type: ScheduleTrigger
  label: string
  milestone_code: string | null
  milestone_date: string | null
  calc_type: ScheduleCalc
  value: string
  calculated_amount: string
  calculatedPaise: bigint
}

export function standardScheduleRows(): ScheduleRowInput[] {
  return STANDARD_PAYMENT_SLABS.map((slab, index) => ({
    id: `standard-${slab.sr}`,
    trigger_type: 'milestone' as const,
    label: slab.label,
    milestone_code: CONSTRUCTION_MILESTONES[index].code,
    calc_type: 'percentage' as const,
    value: slab.percentage,
  }))
}

/**
 * Percentage rows are calculated from Total Consideration (flat + parking).
 * Fixed amounts are kept exactly as entered. Parking is never a separate row.
 * A rounding gap of at most one paise per percentage row is applied to the
 * last percentage row so a 100% schedule totals Total Consideration exactly.
 */
export function resolveSchedule(
  considerationPaise: bigint,
  rows: ScheduleRowInput[]
): { rows: ResolvedScheduleRow[]; totalPaise: bigint; balanced: boolean; error?: string } {
  if (!rows.length) {
    return { rows: [], totalPaise: 0n, balanced: false, error: 'Add at least one payment row' }
  }

  const resolved: ResolvedScheduleRow[] = []
  for (const row of rows) {
    const trigger = row.trigger_type
    const label = (row.label || '').trim()
    const date = row.milestone_date?.trim() || null
    if (trigger === 'date' && !date) {
      return { rows: [], totalPaise: 0n, balanced: false, error: 'Each date row needs a date' }
    }
    if (trigger === 'milestone' && !label) {
      return { rows: [], totalPaise: 0n, balanced: false, error: 'Each milestone row needs a description' }
    }
    const entered = toHundredths(row.value)
    if (entered == null || entered < 0n) {
      return { rows: [], totalPaise: 0n, balanced: false, error: 'Each row needs a percentage or amount' }
    }
    let calculated: bigint | null
    if (row.calc_type === 'fixed') {
      calculated = entered
    } else if (row.calc_type === 'percentage') {
      calculated = percentOfPaise(considerationPaise, hundredthsToString(entered))
    } else {
      return { rows: [], totalPaise: 0n, balanced: false, error: 'Unknown calculation type' }
    }
    if (calculated == null) {
      return { rows: [], totalPaise: 0n, balanced: false, error: 'Could not calculate a schedule row' }
    }
    resolved.push({
      trigger_type: trigger,
      label: trigger === 'date' ? label || date || '' : label,
      milestone_code: trigger === 'milestone' ? (row.milestone_code || null) : null,
      milestone_date: trigger === 'date' ? date : null,
      calc_type: row.calc_type,
      value: hundredthsToString(entered),
      calculated_amount: hundredthsToString(calculated),
      calculatedPaise: calculated,
    })
  }

  let total = resolved.reduce((sum, row) => sum + row.calculatedPaise, 0n)
  const diff = considerationPaise - total
  const percentageIndexes = resolved
    .map((row, index) => (row.calc_type === 'percentage' ? index : -1))
    .filter((index) => index >= 0)
  if (diff !== 0n && percentageIndexes.length > 0 && absBig(diff) <= BigInt(percentageIndexes.length)) {
    const last = percentageIndexes[percentageIndexes.length - 1]
    const adjusted = resolved[last].calculatedPaise + diff
    if (adjusted >= 0n) {
      resolved[last] = {
        ...resolved[last],
        calculatedPaise: adjusted,
        calculated_amount: hundredthsToString(adjusted),
      }
      total += diff
    }
  }

  const balanced = total === considerationPaise
  return {
    rows: resolved,
    totalPaise: total,
    balanced,
    error: balanced
      ? undefined
      : `Payment schedule totals ₹${hundredthsToString(total)} and must equal the Total Consideration of ₹${hundredthsToString(considerationPaise)} (flat + parking).`,
  }
}

function absBig(value: bigint): bigint {
  return value < 0n ? -value : value
}

export function flatBaseFromRate(area: unknown, rate: unknown): bigint | null {
  return flatBasePaise(area, rate)
}

export function sumPaise(values: bigint[]): bigint {
  return values.reduce((sum, value) => sum + value, 0n)
}

export { addPaise }
