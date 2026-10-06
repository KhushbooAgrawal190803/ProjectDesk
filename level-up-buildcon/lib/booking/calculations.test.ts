import { describe, expect, it } from 'vitest'
import {
  calculateGstAmount,
  calculateSlabAmountDue,
  calculateTotalCost,
  clampParking,
  derivePricingFields,
} from './calculations'

describe('calculateTotalCost', () => {
  it('multiplies rate by area', () => {
    expect(calculateTotalCost(5000, 1803)).toBe(9015000)
  })
  it('returns null for invalid input', () => {
    expect(calculateTotalCost(null, 100)).toBeNull()
  })
})

describe('calculateGstAmount', () => {
  it('applies 5% GST on booking amount paid', () => {
    expect(calculateGstAmount(100000)).toBe(5000)
  })
})

describe('calculateSlabAmountDue', () => {
  it('computes percentage of total cost', () => {
    expect(calculateSlabAmountDue(1000000, 20)).toBe(200000)
  })
})

describe('clampParking', () => {
  it('clamps to business limits', () => {
    expect(clampParking(50, 20)).toEqual({ additional_parking: 27, premium_parking: 9 })
  })
})

describe('derivePricingFields', () => {
  it('derives total and gst server-side', () => {
    const result = derivePricingFields({
      rate_per_sqft: 5000,
      super_builtup_area: 100,
      booking_amount_paid: 200000,
    })
    expect(result.total_cost).toBe(500000)
    expect(result.gst_amount).toBe(10000)
  })
})
