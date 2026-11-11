/**
 * Decimal-safe money and area math.
 * Values are scaled integers (paise, or hundredths of a sq.ft.) so
 * 1387.1 × 700 does not drift through binary floating point.
 */

const HUNDRED = 100n

function roundDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new Error('Division by zero')
  const neg = numerator < 0n
  const value = neg ? -numerator : numerator
  const quotient = value / denominator
  const remainder = value % denominator
  const rounded = remainder * 2n >= denominator ? quotient + 1n : quotient
  return neg ? -rounded : rounded
}

/** Parse a decimal into hundredths. Accepts up to 4 fractional digits and rounds half up. */
export function toHundredths(value: unknown): bigint | null {
  if (value == null || value === '') return null
  const raw = String(value).trim().replace(/,/g, '')
  if (!/^-?\d+(\.\d+)?$/.test(raw)) return null
  const neg = raw.startsWith('-')
  const unsigned = neg ? raw.slice(1) : raw
  const [whole, frac = ''] = unsigned.split('.')
  if (frac.length > 4) return null
  const padded = (frac + '0000').slice(0, 4)
  // scale 4, then round half-up to scale 2
  const scale4 = BigInt(whole) * 10000n + BigInt(padded || '0')
  const hundredths = roundDiv(scale4, 100n)
  return neg ? -hundredths : hundredths
}

export function hundredthsToString(value: bigint): string {
  const neg = value < 0n
  const absolute = neg ? -value : value
  const whole = absolute / HUNDRED
  const frac = (absolute % HUNDRED).toString().padStart(2, '0')
  return `${neg ? '-' : ''}${whole.toString()}.${frac}`
}

export function formatInr(value: unknown): string {
  const hundredths = typeof value === 'bigint' ? value : toHundredths(value)
  if (hundredths == null) return '₹0.00'
  const formatted = hundredthsToString(hundredths)
  const [whole, frac] = formatted.replace('-', '').split('.')
  const indian = groupIndian(whole)
  return `${formatted.startsWith('-') ? '-' : ''}₹${indian}.${frac}`
}

function groupIndian(whole: string): string {
  if (whole.length <= 3) return whole
  const tail = whole.slice(-3)
  let head = whole.slice(0, -3)
  const parts: string[] = []
  while (head.length > 2) {
    parts.unshift(head.slice(-2))
    head = head.slice(0, -2)
  }
  if (head) parts.unshift(head)
  return `${parts.join(',')},${tail}`
}

/** Super built-up area × rate per sq.ft., in paise. */
export function flatBasePaise(area: unknown, rate: unknown): bigint | null {
  const areaHundredths = toHundredths(area)
  const rateHundredths = toHundredths(rate)
  if (areaHundredths == null || rateHundredths == null) return null
  if (areaHundredths <= 0n || rateHundredths <= 0n) return null
  // (area×100) * (rate×100) / 100 = paise, half-up
  return roundDiv(areaHundredths * rateHundredths, HUNDRED)
}

export function percentOfPaise(basePaise: bigint, percent: unknown): bigint | null {
  const percentHundredths = toHundredths(percent)
  if (percentHundredths == null || percentHundredths < 0n) return null
  return roundDiv(basePaise * percentHundredths, 10000n)
}

/** GST at 5% of the booking amount, in paise. Does not record collection. */
export function gstApplicablePaise(bookingAmount: unknown): bigint | null {
  const paid = toHundredths(bookingAmount)
  if (paid == null || paid < 0n) return null
  return roundDiv(paid * 5n, 100n)
}

export function addPaise(values: Array<bigint | null>): bigint | null {
  let total = 0n
  for (const value of values) {
    if (value == null) return null
    total += value
  }
  return total
}

export function paiseNumber(value: bigint): number {
  return Number(hundredthsToString(value))
}
