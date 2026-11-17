import { describe, expect, it } from 'vitest'
import { formatPostalAddress } from './address'
import { flatBasePaise, hundredthsToString } from './money'
import { getUnitBoundaries } from '@/lib/data/flat-boundaries'
import { resolveSchedule, standardScheduleRows } from './schedule'

describe('formatPostalAddress', () => {
  it('omits blank lines and does not add a comma before the PIN', () => {
    expect(formatPostalAddress({
      address_line1: '12 Main Road',
      address_line2: '',
      city: 'Ranchi',
      state: 'Jharkhand',
      pin_code: '834001',
      country: 'India',
    })).toBe('12 Main Road\nRanchi, Jharkhand - 834001\nIndia')
  })
})

describe('boundaries', () => {
  it('uses the spreadsheet text for unit 205, including the lowercase south line', () => {
    expect(getUnitBoundaries('205')).toEqual({
      east: 'Flat no. 206',
      west: 'Open space of anandam',
      north: 'Community hall',
      south: 'flat no. 208',
    })
  })
  it('does not invent boundaries for a unit that is not in the sheet', () => {
    expect(getUnitBoundaries('101')).toBeNull()
  })
})

describe('payment schedule', () => {
  it('makes the standard slabs total Total Consideration, including parking', () => {
    const base = flatBasePaise(1803, 700)
    expect(base).not.toBeNull()
    const resolved = resolveSchedule(base as bigint, standardScheduleRows())
    expect(resolved.balanced).toBe(true)
    expect(resolved.totalPaise).toBe(base)
  })

  it('charges parking through the percentages instead of as its own row', () => {
    const flat = flatBasePaise(1528, 4500)
    const parking = 22500000n
    expect(flat).toBe(687600000n)
    const resolved = resolveSchedule((flat as bigint) + parking, standardScheduleRows())
    expect(resolved.rows).toHaveLength(14)
    expect(resolved.totalPaise).toBe(710100000n)
    expect(resolved.rows.some((row) => /parking/i.test(row.label))).toBe(false)
  })

  it('keeps a fixed amount exact and balances a mixed schedule', () => {
    const base = flatBasePaise(1, 5000000)
    expect(hundredthsToString(base as bigint)).toBe('5000000.00')
    const resolved = resolveSchedule(base as bigint, [
      { trigger_type: 'milestone', label: 'First-floor completion', calc_type: 'percentage', value: 20 },
      { trigger_type: 'milestone', label: 'Fifth-floor completion', calc_type: 'percentage', value: 30 },
      { trigger_type: 'date', label: '15 March 2027', milestone_date: '2027-03-15', calc_type: 'fixed', value: 1000000 },
      { trigger_type: 'milestone', label: 'At possession', calc_type: 'percentage', value: 30 },
    ])
    expect(resolved.balanced).toBe(true)
    expect(resolved.rows[2].calculated_amount).toBe('1000000.00')
    expect(resolved.totalPaise).toBe(base)
  })
})
