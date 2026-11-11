import { describe, expect, it } from 'vitest'
import { gstApplicablePaise, hundredthsToString, percentOfPaise } from './money'
import {
  auditStoredSchedule,
  considerationOf,
  financeContributions,
  scheduleOnConsideration,
} from './consideration'
import { resolveSchedule, standardScheduleRows } from './schedule'

/** Flat 506: 1,528 sq.ft. × ₹4,500 + ₹2,25,000 parking. */
const FLAT_506 = 687600000n
const PARKING_506 = 22500000n
const TOTAL_506 = 710100000n

describe('Total Consideration', () => {
  it('is super built-up × rate plus parking, and never includes GST', () => {
    const priced = considerationOf({
      super_builtup_area: 1528,
      rate_per_sqft: 4500,
      parking_spaces: [{ price: 225000 }],
    })
    expect(priced).toEqual({ flatPaise: FLAT_506, parkingPaise: PARKING_506, totalPaise: TOTAL_506 })
    expect(gstApplicablePaise(hundredthsToString(priced!.totalPaise))).toBe(35505000n)
    expect(priced!.totalPaise + (gstApplicablePaise(hundredthsToString(priced!.totalPaise)) ?? 0n)).not.toBe(priced!.totalPaise)
  })

  it('keeps a booking with no parking on the flat price alone', () => {
    const priced = considerationOf({ super_builtup_area: 1803, rate_per_sqft: 5000, total_parking_charges: 0 })
    expect(priced).toEqual({ flatPaise: 901500000n, parkingPaise: 0n, totalPaise: 901500000n })
  })

  it('uses a lump-sum flat price and still adds parking', () => {
    const priced = considerationOf({
      pricing_mode: 'lump_sum',
      total_cost: 5000000,
      total_parking_charges: 150000,
    })
    expect(priced?.flatPaise).toBe(500000000n)
    expect(priced?.totalPaise).toBe(515000000n)
  })
})

describe('payment schedule on Total Consideration', () => {
  it('puts 20% of the combined 506 price on the booking installment, not 20% of the flat alone', () => {
    const priced = considerationOf({
      super_builtup_area: 1528,
      rate_per_sqft: 4500,
      total_parking_charges: 225000,
    })!
    const resolved = scheduleOnConsideration(priced, standardScheduleRows())
    expect(resolved.balanced).toBe(true)
    expect(resolved.totalPaise).toBe(TOTAL_506)
    expect(resolved.rows[0].calculatedPaise).toBe(142020000n)
    expect(resolved.rows[0].calculatedPaise).not.toBe(percentOfPaise(FLAT_506, 20))
    expect(resolved.rows.reduce((sum, row) => sum + row.calculatedPaise, 0n)).toBe(TOTAL_506)
  })

  it('balances a 100% custom mix of percentages and a fixed amount to Total Consideration', () => {
    const consideration = 7_101_000_00n
    const resolved = resolveSchedule(consideration, [
      { trigger_type: 'milestone', label: 'Agreement', calc_type: 'percentage', value: 20 },
      { trigger_type: 'milestone', label: 'Halfway', calc_type: 'percentage', value: 30 },
      { trigger_type: 'date', label: 'Fixed', milestone_date: '2027-04-01', calc_type: 'fixed', value: 1420200 },
      { trigger_type: 'milestone', label: 'Handover', calc_type: 'percentage', value: 30 },
    ])
    expect(resolved.balanced).toBe(true)
    expect(resolved.totalPaise).toBe(consideration)
    expect(resolved.rows[2].calculatedPaise).toBe(142020000n)
  })

  it('applies a one-paise rounding adjustment to the last percentage row', () => {
    const consideration = 10001n
    const resolved = resolveSchedule(consideration, [
      { trigger_type: 'milestone', label: 'A', calc_type: 'percentage', value: 50 },
      { trigger_type: 'milestone', label: 'B', calc_type: 'percentage', value: 50 },
    ])
    expect(resolved.balanced).toBe(true)
    expect(resolved.rows[0].calculatedPaise + resolved.rows[1].calculatedPaise).toBe(consideration)
  })
})

describe('financing scenarios', () => {
  const booking = 142020000n

  it('scenario 1: the purchaser pays the whole installment', () => {
    expect(financeContributions(booking, TOTAL_506, 'purchaser', 'booking')).toEqual({
      purchaserPaise: booking,
      bankPaise: 0n,
    })
  })

  it('scenario 2: 10% of Total Consideration from the purchaser and 10% from the bank at booking only', () => {
    const split = financeContributions(booking, TOTAL_506, 'split_50_50', 'booking')
    expect(split.purchaserPaise).toBe(71010000n)
    expect(split.bankPaise).toBe(71010000n)
    expect(split.purchaserPaise + split.bankPaise).toBe(booking)
    const later = financeContributions(68760000n, TOTAL_506, 'split_50_50', 'later')
    expect(later).toEqual({ purchaserPaise: 68760000n, bankPaise: 0n })
  })

  it('scenario 3: 10% purchaser and 90% bank of every installment, including parking in the installment', () => {
    const split = financeContributions(booking, TOTAL_506, 'split_10_90', 'booking')
    expect(split.purchaserPaise).toBe(14202000n)
    expect(split.bankPaise).toBe(127818000n)
    expect(split.purchaserPaise + split.bankPaise).toBe(booking)
    const later = financeContributions(68760000n, TOTAL_506, 'split_10_90', 'later')
    expect(later.purchaserPaise + later.bankPaise).toBe(68760000n)
    expect(later.purchaserPaise).toBe(6876000n)
  })
})

describe('schedule audit', () => {
  it('flags a stored schedule that was calculated on the flat alone', () => {
    const old = resolveSchedule(FLAT_506, standardScheduleRows())
    const audit = auditStoredSchedule({
      unitNo: '506',
      serial: 'LUBC 01',
      storedRows: old.rows,
      consideration: { flatPaise: FLAT_506, parkingPaise: PARKING_506, totalPaise: TOTAL_506 },
      standardRows: standardScheduleRows(),
      frozen: true,
      frozenReason: 'Demand notes have already been issued.',
    })
    expect(audit.matches).toBe(false)
    expect(audit.storedFirstPaise).toBe(137520000n)
    expect(audit.correctedFirstPaise).toBe(142020000n)
    expect(audit.frozen).toBe(true)
  })
})
