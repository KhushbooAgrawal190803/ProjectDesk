/** Server-side financial rules — do not trust client-calculated amounts. */

const GST_RATE = 0.05
export const MAX_ADDITIONAL_PARKING = 27
export const MAX_PREMIUM_PARKING = 9

export function calculateTotalCost(ratePerSqft: number | null | undefined, areaSqft: number | null | undefined): number | null {
  if (ratePerSqft == null || areaSqft == null) return null
  if (!Number.isFinite(ratePerSqft) || !Number.isFinite(areaSqft)) return null
  if (ratePerSqft <= 0 || areaSqft <= 0) return null
  return ratePerSqft * areaSqft
}

export function calculateGstAmount(bookingAmountPaid: number | null | undefined): number | null {
  if (bookingAmountPaid == null || !Number.isFinite(bookingAmountPaid)) return null
  if (bookingAmountPaid <= 0) return null
  return bookingAmountPaid * GST_RATE
}

export function calculateSlabAmountDue(totalCost: number, percentage: number): number {
  const base = Number(totalCost) || 0
  const pct = Number(percentage) || 0
  return (base * pct) / 100
}

export function clampParking(additional: number | null | undefined, premium: number | null | undefined) {
  return {
    additional_parking: Math.min(MAX_ADDITIONAL_PARKING, Math.max(0, Math.floor(Number(additional) || 0))),
    premium_parking: Math.min(MAX_PREMIUM_PARKING, Math.max(0, Math.floor(Number(premium) || 0))),
  }
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

export function derivePricingFields(input: {
  rate_per_sqft?: unknown
  super_builtup_area?: unknown
  builtup_area?: unknown
  carpet_area?: unknown
  booking_amount_paid?: unknown
  total_cost?: unknown
  gst_amount?: unknown
}) {
  const rate = toNum(input.rate_per_sqft)
  const area =
    toNum(input.super_builtup_area) ?? toNum(input.builtup_area) ?? toNum(input.carpet_area)
  const derivedTotal = calculateTotalCost(rate, area)
  const paid = toNum(input.booking_amount_paid)
  const derivedGst = calculateGstAmount(paid)

  return {
    rate_per_sqft: rate,
    total_cost: derivedTotal ?? toNum(input.total_cost),
    gst_amount: derivedGst ?? toNum(input.gst_amount),
    booking_amount_paid: paid,
  }
}
