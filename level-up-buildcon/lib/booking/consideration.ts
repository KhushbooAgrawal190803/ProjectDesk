import { flatBaseFromPricing } from './calculations'
import { hundredthsToString, percentOfPaise, toHundredths } from './money'
import { resolveSchedule, type ScheduleRowInput } from './schedule'

/**
 * One shared money model for the booking, the payment schedule, the agreement
 * and the demand notes.
 *
 * Total Consideration = (super built-up × rate, or the lump-sum flat price)
 *                     + parking charges.
 * GST is never part of this figure. Installment percentages are of this figure.
 */
export interface Consideration {
  /** Super built-up × rate, or the lump-sum flat price. Parking is not in this. */
  flatPaise: bigint
  parkingPaise: bigint
  /** Combined Total Consideration. GST is not included. */
  totalPaise: bigint
}

export type FinanceScenario = 'purchaser' | 'split_50_50' | 'split_10_90'

export function parkingPaiseFromSpaces(spaces: Array<{ price?: unknown }> | null | undefined): bigint {
  if (!spaces?.length) return 0n
  return spaces.reduce((sum, space) => sum + (toHundredths(space.price) ?? 0n), 0n)
}

export function considerationOf(input: {
  pricing_mode?: unknown
  super_builtup_area?: unknown
  rate_per_sqft?: unknown
  total_cost?: unknown
  basic_sale_price?: unknown
  total_property_value?: unknown
  total_parking_charges?: unknown
  parking_spaces?: Array<{ price?: unknown }> | null
}): Consideration | null {
  const parking = Array.isArray(input.parking_spaces)
    ? parkingPaiseFromSpaces(input.parking_spaces)
    : toHundredths(input.total_parking_charges) ?? 0n
  if (parking < 0n) return null
  const flat =
    flatBaseFromPricing(input) ??
    toHundredths(input.basic_sale_price) ??
    toHundredths(input.total_cost)
  if (flat != null && flat >= 0n) {
    return { flatPaise: flat, parkingPaise: parking, totalPaise: flat + parking }
  }
  const stored = toHundredths(input.total_property_value)
  if (stored == null || stored < 0n) return null
  const impliedFlat = stored - parking
  return {
    flatPaise: impliedFlat > 0n ? impliedFlat : stored,
    parkingPaise: impliedFlat > 0n ? parking : 0n,
    totalPaise: stored,
  }
}

/**
 * Purchaser and bank shares of one installment. The two shares always add up
 * to the installment. Parking is already inside the installment; it is not
 * added again.
 */
export function financeContributions(
  installmentPaise: bigint,
  considerationPaise: bigint,
  scenario: FinanceScenario,
  kind: 'booking' | 'later'
): { purchaserPaise: bigint; bankPaise: bigint } {
  if (installmentPaise < 0n) return { purchaserPaise: 0n, bankPaise: 0n }
  if (scenario === 'purchaser' || (scenario === 'split_50_50' && kind === 'later')) {
    return { purchaserPaise: installmentPaise, bankPaise: 0n }
  }
  if (scenario === 'split_50_50') {
    const purchaser = percentOfPaise(considerationPaise, 10) ?? 0n
    return { purchaserPaise: purchaser, bankPaise: installmentPaise - purchaser }
  }
  const purchaser = percentOfPaise(installmentPaise, 10) ?? 0n
  return { purchaserPaise: purchaser, bankPaise: installmentPaise - purchaser }
}

export function scheduleOnConsideration(consideration: Consideration, rows: ScheduleRowInput[]) {
  return resolveSchedule(consideration.totalPaise, rows)
}

export interface ScheduleAudit {
  unitNo: string
  serial: string
  flatPaise: bigint
  parkingPaise: bigint
  considerationPaise: bigint
  storedSchedulePaise: bigint
  correctedFirstPaise: bigint | null
  storedFirstPaise: bigint | null
  matches: boolean
  frozen: boolean
  frozenReason: string | null
}

export function auditStoredSchedule(input: {
  unitNo?: unknown
  serial?: unknown
  storedRows: Array<{ calculated_amount?: unknown }>
  consideration: Consideration
  standardRows?: ScheduleRowInput[]
  frozen?: boolean
  frozenReason?: string | null
}): ScheduleAudit {
  const stored = input.storedRows.reduce((sum, row) => sum + (toHundredths(row.calculated_amount) ?? 0n), 0n)
  const corrected = input.standardRows
    ? resolveSchedule(input.consideration.totalPaise, input.standardRows)
    : null
  return {
    unitNo: String(input.unitNo || ''),
    serial: String(input.serial || ''),
    flatPaise: input.consideration.flatPaise,
    parkingPaise: input.consideration.parkingPaise,
    considerationPaise: input.consideration.totalPaise,
    storedSchedulePaise: stored,
    correctedFirstPaise: corrected?.rows[0]?.calculatedPaise ?? null,
    storedFirstPaise: input.storedRows[0] ? toHundredths(input.storedRows[0].calculated_amount) : null,
    matches: stored === input.consideration.totalPaise,
    frozen: Boolean(input.frozen),
    frozenReason: input.frozenReason || null,
  }
}

export function rupees(value: bigint): string {
  return hundredthsToString(value)
}
