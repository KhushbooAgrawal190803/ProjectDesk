/** Server-side financial rules — do not trust client-calculated amounts. */

import { flatBasePaise, gstApplicablePaise, hundredthsToString, paiseNumber, percentOfPaise, toHundredths } from './money'
import { MAIN_PARKING_SPACES, SECONDARY_PARKING_SPACES } from './schedule'

export const MAX_ADDITIONAL_PARKING = MAIN_PARKING_SPACES
export const MAX_PREMIUM_PARKING = SECONDARY_PARKING_SPACES

export function calculateTotalCost(ratePerSqft: number | null | undefined, areaSqft: number | null | undefined): number | null {
  const paise = flatBasePaise(areaSqft, ratePerSqft)
  if (paise == null) return null
  return paiseNumber(paise)
}

export function calculateGstAmount(bookingAmountPaid: number | null | undefined): number | null {
  if (bookingAmountPaid == null || bookingAmountPaid === ('' as unknown)) return null
  const paise = gstApplicablePaise(bookingAmountPaid)
  if (paise == null) return null
  if (toHundredths(bookingAmountPaid) === 0n) return 0
  return paiseNumber(paise)
}

export function calculateSlabAmountDue(totalCost: number, percentage: number): number {
  const base = toHundredths(totalCost)
  if (base == null) return 0
  const due = percentOfPaise(base, percentage)
  return due == null ? 0 : paiseNumber(due)
}

export function clampParking(additional: number | null | undefined, premium: number | null | undefined) {
  return {
    additional_parking: Math.min(MAX_ADDITIONAL_PARKING, Math.max(0, Math.floor(Number(additional) || 0))),
    premium_parking: Math.min(MAX_PREMIUM_PARKING, Math.max(0, Math.floor(Number(premium) || 0))),
  }
}

export function moneyString(value: unknown): string | null {
  const hundredths = toHundredths(value)
  if (hundredths == null) return null
  return hundredthsToString(hundredths)
}

export function toNum(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Prefer super built-up, then built-up, then carpet for pricing area. */
export function pricingAreaSqft(booking: {
  super_builtup_area?: number | null
  builtup_area?: number | null
  carpet_area?: number | null
}): number | null {
  return (
    toNum(booking.super_builtup_area) ??
    toNum(booking.builtup_area) ??
    toNum(booking.carpet_area)
  )
}

/** Flat consideration: super built-up × rate, or a lump sum. Parking is added separately to make Total Consideration. */
export function flatBaseFromPricing(input: {
  pricing_mode?: unknown
  super_builtup_area?: unknown
  rate_per_sqft?: unknown
  total_cost?: unknown
}): bigint | null {
  if (input.pricing_mode === 'lump_sum') {
    const lump = toHundredths(input.total_cost)
    if (lump == null || lump <= 0n) return null
    return lump
  }
  return flatBasePaise(input.super_builtup_area, input.rate_per_sqft)
}

export function derivePricingFields(input: {
  pricing_mode?: unknown
  rate_per_sqft?: unknown
  super_builtup_area?: unknown
  builtup_area?: unknown
  carpet_area?: unknown
  booking_amount_paid?: unknown
  total_cost?: unknown
  gst_amount?: unknown
}) {
  const paid = toNum(input.booking_amount_paid)
  const derivedGst = paid == null ? null : calculateGstAmount(paid)
  if (input.pricing_mode === 'lump_sum') {
    const lump = toNum(input.total_cost)
    return {
      rate_per_sqft: null,
      basic_sale_price: lump,
      total_cost: lump,
      gst_amount: derivedGst ?? toNum(input.gst_amount),
      booking_amount_paid: paid,
    }
  }
  const rate = toNum(input.rate_per_sqft)
  const area = toNum(input.super_builtup_area)
  const derivedTotal = calculateTotalCost(rate, area)

  return {
    rate_per_sqft: rate,
    basic_sale_price: derivedTotal,
    total_cost: derivedTotal ?? toNum(input.total_cost),
    gst_amount: derivedGst ?? toNum(input.gst_amount),
    booking_amount_paid: paid,
  }
}
