import { hundredthsToString } from '@/lib/booking/money'

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
]

const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function twoDigits(n: number): string {
  if (n < 20) return ONES[n]
  const ten = Math.floor(n / 10)
  const one = n % 10
  return one ? `${TENS[ten]}-${ONES[one]}` : TENS[ten]
}

function threeDigits(n: number): string {
  const hundred = Math.floor(n / 100)
  const rest = n % 100
  const parts: string[] = []
  if (hundred) parts.push(`${ONES[hundred]} Hundred`)
  if (rest) parts.push(twoDigits(rest))
  return parts.join(' ')
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

/** 66,12,000 as the agreement writes figures. Paise appear only when there are any. */
export function formatAmountFigures(paise: bigint): string {
  const raw = hundredthsToString(paise)
  const neg = raw.startsWith('-')
  const [whole, frac] = raw.replace('-', '').split('.')
  const tail = frac && frac !== '00' ? `.${frac}` : ''
  return `${neg ? '-' : ''}${groupIndian(whole)}${tail}`
}

/** Rs. 66,12,000.00 */
export function formatRs(paise: bigint): string {
  const raw = hundredthsToString(paise)
  const neg = raw.startsWith('-')
  const [whole, frac] = raw.replace('-', '').split('.')
  return `${neg ? '-' : ''}Rs. ${groupIndian(whole)}.${frac}`
}

/** Rupees Sixty-Six Lakhs Twelve Thousand only */
export function rupeesInWords(paise: bigint): string {
  if (paise < 0n) throw new Error('Amount cannot be negative')
  const rupees = paise / 100n
  const fraction = Number(paise % 100n)
  const crore = rupees / 10000000n
  const lakh = (rupees / 100000n) % 100n
  const thousand = (rupees / 1000n) % 100n
  const rest = rupees % 1000n
  const parts: string[] = []
  const push = (value: bigint, singular: string, plural: string) => {
    if (value === 0n) return
    parts.push(`${threeDigits(Number(value))} ${value === 1n ? singular : plural}`)
  }
  push(crore, 'Crore', 'Crores')
  push(lakh, 'Lakh', 'Lakhs')
  push(thousand, 'Thousand', 'Thousand')
  if (rest > 0n) parts.push(threeDigits(Number(rest)))
  const rupeeWords = parts.length ? parts.join(' ') : 'Zero'
  const paiseWords = fraction > 0 ? ` and ${twoDigits(fraction)} Paise` : ''
  return `Rupees ${rupeeWords}${paiseWords} only`
}

export function rsWithWords(paise: bigint): string {
  return `${formatRs(paise)} (${rupeesInWords(paise)})`
}

/** 2026-07-30 or an ISO timestamp -> 30.07.2026. Returns null when the value is not a date. */
export function formatLetterDate(value?: string | null): string | null {
  if (!value) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim())
  if (!match) return null
  return `${match[3]}.${match[2]}.${match[1]}`
}
