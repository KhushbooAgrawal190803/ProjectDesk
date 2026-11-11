import { describe, expect, it } from 'vitest'
import {
  calculateGstAmount,
  calculateSlabAmountDue,
  calculateTotalCost,
  clampParking,
  derivePricingFields,
  flatBaseFromPricing,
} from './calculations'

describe('calculateTotalCost', () => {
  it('multiplies rate by area', () => {
    expect(calculateTotalCost(5000, 1803)).toBe(9015000)
  })
  it('keeps a decimal super built-up area exact', () => {
    expect(calculateTotalCost(700, 1387.1)).toBe(970970)
  })
  it('calculates 5% GST on 5000 without marking it received', () => {
    expect(calculateGstAmount(5000)).toBe(250)
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
    expect(clampParking(100, 40)).toEqual({ additional_parking: 79, premium_parking: 27 })
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

  it('keeps a lump sum and clears the rate', () => {
    const result = derivePricingFields({
      pricing_mode: 'lump_sum',
      rate_per_sqft: 5000,
      super_builtup_area: 100,
      total_cost: 2500000,
      booking_amount_paid: 100000,
    })
    expect(result.rate_per_sqft).toBeNull()
    expect(result.total_cost).toBe(2500000)
    expect(result.basic_sale_price).toBe(2500000)
    expect(flatBaseFromPricing({ pricing_mode: 'lump_sum', total_cost: 2500000, rate_per_sqft: 5000 })).toBe(250000000n)
  })
})
