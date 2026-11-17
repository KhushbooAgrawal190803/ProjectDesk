import { percentOfPaise } from '@/lib/booking/money'
import { formatAmountFigures, formatLetterDate, rupeesInWords } from '@/lib/documents/inr-words'

/** Printed where a fact has not been entered, so it can be written in by hand. */
export const BLANK = '____________'

export interface AgreementPayment {
  payer: string
  /** Principal of this cheque or transfer. GST is not included. */
  amountPaise: bigint
  /** GST on this payment. When omitted, 5% of the principal is used. */
  gstPaise?: bigint | null
  mode?: string | null
  modeDetail?: string | null
  reference?: string | null
  date?: string | null
  bank?: string | null
}

export interface ScheduleSource {
  code: string | null
  label: string
  date?: string | null
  amountPaise: bigint
}

export interface ScheduleLine {
  /** BOOKING, or a construction milestone code, or null for a row the master has no wording for. */
  code: string | null
  label: string
  amountPaise: bigint
}

/** The fifteen rows of Schedule C in the master, in order. */
export const MASTER_SCHEDULE_CODES = [
  'BOOKING',
  'AGREEMENT',
  'BASEMENT',
  'GROUND',
  'FLOOR_1',
  'FLOOR_2',
  'FLOOR_3',
  'FLOOR_4',
  'FLOOR_5',
  'FLOOR_6',
  'FLOOR_7',
  'FLOOR_8',
  'FLOOR_9',
  'FLOOR_10',
  'HANDOVER',
] as const

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const COUNT_WORDS = ['Nil', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten']

export function ordinalSuffix(n: number): string {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return 'th'
  switch (n % 10) {
    case 1:
      return 'st'
    case 2:
      return 'nd'
    case 3:
      return 'rd'
    default:
      return 'th'
  }
}

export function ordinal(n: number): string {
  return `${n}${ordinalSuffix(n)}`
}

/** 2026-11-11 -> 11, th, November, 2026 for "executed on this 11th day of November, 2026". */
export function agreementDateParts(isoDate: string): { day: string; suffix: string; month: string; year: string } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate.trim())
  if (!match) return null
  const day = Number(match[3])
  const month = MONTHS[Number(match[2]) - 1]
  if (!month || day < 1 || day > 31) return null
  return { day: String(day), suffix: ordinalSuffix(day), month, year: match[1] }
}

/** Rs.71,01,000/- */
export function rs(paise: bigint): string {
  return `Rs.${formatAmountFigures(paise)}/-`
}

/** Rupees Seventy-One Lakhs One Thousand. The master supplies the closing "Only". */
export function amountWords(paise: bigint): string {
  return rupeesInWords(paise).replace(/\s+only$/i, '')
}

/** 1 (One), as the master writes "X (XXX) covered car parking space". */
export function countWithWord(count: number): string {
  const word = COUNT_WORDS[count]
  return word ? `${count} (${word})` : String(count)
}

/** Names the primary and secondary counts separately, including a count of zero. */
export function parkingPhrase(primary: number, secondary: number): string {
  const line = (count: number, kind: string) => {
    const safe = count > 0 ? count : 0
    return `${countWithWord(safe)} ${kind} covered car parking ${safe === 1 ? 'space' : 'spaces'}`
  }
  if (primary <= 0 && secondary <= 0) return BLANK
  return `${line(primary, 'primary')} and ${line(secondary, 'secondary')}`
}

const TITLE = /^(mr|mrs|ms|miss|dr|shri|sri|smt|late|md|prof|kumari)\b\.?/i

function withTitle(name: string, title: string): string {
  return TITLE.test(name) ? name : `${title} ${name}`
}

/**
 * "wife of Mr. Arjun Kapoor", in the form the master uses. Returns the missing
 * part as a blank so the sentence still reads when a detail was not entered.
 */
export function relationPhrase(
  salutation: string | null | undefined,
  relationship: string | null | undefined,
  relativeName: string | null | undefined
): string {
  const who = (relativeName || '').trim()
  const rel = (relationship || '').trim()
  const title = (salutation || '').trim().replace(/\.$/, '').toLowerCase()
  const child = title === 'mr' ? 'son' : ['mrs', 'ms', 'miss', 'smt', 'kumari'].includes(title) ? 'daughter' : 'son/daughter'
  if (rel === 'Husband') return `wife of ${who ? withTitle(who, 'Mr.') : BLANK}`
  if (rel === 'Wife') return `husband of ${who ? withTitle(who, 'Mrs.') : BLANK}`
  if (rel === 'Father') return `${child} of ${who ? withTitle(who, 'Mr.') : BLANK}`
  if (rel === 'Mother') return `${child} of ${who ? withTitle(who, 'Mrs.') : BLANK}`
  return `${BLANK} of ${who || BLANK}`
}

export function joinNames(names: string[]): string {
  const list = names.filter(Boolean)
  if (list.length <= 1) return list[0] || ''
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`
}

/** How the booking amount is funded. */
export type FinanceScenario = 'purchaser' | 'split_50_50' | 'split_10_90' | 'split'

export interface AgreementFinance {
  scenario: FinanceScenario
  /** The financing bank. Blank when it has not been entered. */
  bankName: string
  /** true when the loan is sanctioned, false when it is not yet, null when this was not stated. */
  loanSanctioned: boolean | null
  /** Used when the scenario is `split`: the purchaser's share of the instalment. */
  purchaserPercent?: number | null
  /** Used when the scenario is `split`: the bank's share of the instalment. */
  bankPercent?: number | null
  /** `booking` applies the split to the booking instalment only. `every` applies it to each instalment. */
  scope?: 'booking' | 'every' | null
}

/** Rs. 5,00,000/- as the approved booking-amount wording writes it. */
export function rsSpaced(paise: bigint): string {
  return `Rs. ${formatAmountFigures(paise)}/-`
}

function entryLetter(index: number): string {
  const letters = 'abcdefghijklmnopqrstuvwxyz'
  return index < letters.length ? letters[index] : `${letters[Math.floor(index / letters.length) - 1]}${letters[index % letters.length]}`
}

export function isCheque(payment: AgreementPayment): boolean {
  return payment.mode === 'Cheque'
}

/**
 * How the amount was paid. A cheque is worded exactly as approved. Other
 * modes name the instrument actually used in its place.
 */
function instrument(payment: AgreementPayment): string {
  const reference = (payment.reference || '').trim()
  const date = formatLetterDate(payment.date) || BLANK
  const payer = payment.payer.trim() || BLANK
  switch (payment.mode) {
    case 'Cheque':
      return `vide Cheque No. ${reference || BLANK} dated ${date}, issued in the name of ${payer}`
    case 'NEFT_RTGS':
      return `vide NEFT/RTGS Reference No. ${reference || BLANK} dated ${date}, remitted by ${payer}`
    case 'UPI':
      return `vide UPI Transaction No. ${reference || BLANK} dated ${date}, remitted by ${payer}`
    case 'Cash':
      return `in cash on ${date}${reference ? ` (Reference No. ${reference})` : ''}, paid by ${payer}`
    default: {
      const name = (payment.modeDetail || '').trim() || BLANK
      return `vide ${name} No. ${reference || BLANK} dated ${date}, paid by ${payer}`
    }
  }
}

function gstOf(payment: AgreementPayment): bigint {
  if (payment.gstPaise != null) return payment.gstPaise > 0n ? payment.gstPaise : 0n
  return percentOfPaise(payment.amountPaise, 5) ?? 0n
}

function moneyWithWords(paise: bigint): string {
  return `${rsSpaced(paise)} (${amountWords(paise)} Only)`
}

/**
 * One entry per payment actually received, for "details of which are as follows:".
 * Principal, GST and the total (principal + GST) are each written in figures and words.
 * With nothing recorded, one entry is printed with blanks to be written in.
 */
export function paymentEntryLines(payments: AgreementPayment[]): string[] {
  if (!payments.length) {
    const blank = `Rs. ${BLANK}/- (Rupees ${BLANK} Only)`
    return [`(a) ${blank}, GST ${blank}, total ${blank} vide Cheque No. ${BLANK} dated ${BLANK}, issued in the name of ${BLANK};`]
  }
  return payments.map((payment, index) => {
    const gst = gstOf(payment)
    const total = payment.amountPaise + gst
    return `(${entryLetter(index)}) ${moneyWithWords(payment.amountPaise)}, GST ${moneyWithWords(gst)}, total ${moneyWithWords(total)} ${instrument(payment)};`
  })
}

/**
 * The banks named after "The aforesaid cheque(s) are drawn on". Only cheques
 * count; a cheque with no bank entered leaves a blank. Null when no payment
 * was made by cheque, so the cheque wording is not used at all.
 */
export function chequeBanks(payments: AgreementPayment[]): string | null {
  if (!payments.length) return BLANK
  const cheques = payments.filter(isCheque)
  if (!cheques.length) return null
  return joinNames([...new Set(cheques.map((payment) => (payment.bank || '').trim() || BLANK))])
}

const LOAN_SANCTIONED = 'subject to the terms and conditions of the sanctioned housing loan, where applicable'
const LOAN_PROPOSED = 'subject to sanction, disbursement and the terms and conditions of the proposed housing loan'

/**
 * The paragraphs that follow the payment entries when a bank funds part of the
 * price. Empty when the purchaser pays the whole booking amount. The wording
 * is the approved text; only the bank name and the loan phrase are filled in.
 */
export function financeParagraphs(finance: AgreementFinance): string[] {
  const bank = finance.bankName.trim() || BLANK
  const loan = finance.loanSanctioned === false ? LOAN_PROPOSED : LOAN_SANCTIONED
  if (finance.scenario === 'split_50_50') {
    return [
      `Out of the 20% booking amount specified in Schedule 'C' of the Agreement, 10% of the Total Consideration shall be paid directly by the Allottee(s) (Client), and the remaining 10% shall be disbursed by ${bank}, ${loan}.`,
      `The amount to be disbursed by the financing bank shall remain payable until actually received by the Promoter. All subsequent installments shall be payable in accordance with Schedule 'C' of this Agreement.`,
    ]
  }
  if (finance.scenario === 'split_10_90') {
    return [
      `Out of the 20% booking amount specified in Schedule 'C' of the Agreement, 10% of the said booking amount shall be paid directly by the Allottee(s) (Client), and the remaining 90% shall be disbursed by ${bank}, ${loan}.`,
      `The same payment arrangement shall apply to all subsequent construction-linked installments/slabs mentioned in Schedule 'C', whereby 10% of each installment amount shall be contributed by the Allottee(s) (Client), and the remaining 90% shall be disbursed by ${bank}, subject to the terms and conditions of the housing loan.`,
      `Any amount to be disbursed by the financing bank, whether towards the booking amount or any subsequent installment, shall remain payable until actually received by the Promoter.`,
    ]
  }
  if (finance.scenario === 'split') {
    const purchaser = finance.purchaserPercent == null ? BLANK : String(finance.purchaserPercent)
    const bankShare = finance.bankPercent == null ? BLANK : String(finance.bankPercent)
    const bookingLine = `Out of the booking amount specified in Schedule 'C' of the Agreement, ${purchaser}% of that amount shall be paid directly by the Allottee(s) (Client), and the remaining ${bankShare}% shall be disbursed by ${bank}, ${loan}.`
    if (finance.scope === 'booking') {
      return [
        bookingLine,
        `The amount to be disbursed by the financing bank shall remain payable until actually received by the Promoter. All subsequent installments shall be payable in full by the Allottee(s) in accordance with Schedule 'C' of this Agreement.`,
      ]
    }
    return [
      bookingLine,
      `The same payment arrangement shall apply to all subsequent construction-linked installments/slabs mentioned in Schedule 'C', whereby ${purchaser}% of each installment amount shall be contributed by the Allottee(s) (Client), and the remaining ${bankShare}% shall be disbursed by ${bank}, subject to the terms and conditions of the housing loan.`,
      `Any amount to be disbursed by the financing bank, whether towards the booking amount or any subsequent installment, shall remain payable until actually received by the Promoter.`,
    ]
  }
  return []
}

/**
 * The agreement-signing instalment. The booking form does not use one label:
 * "At agreement", "At execution of agreement" and "On signing of agreement"
 * are the same stage as the master's "execution of the Agreement". A row that
 * already carries another milestone code is left on that milestone.
 */
export function isAgreementStage(code: string | null | undefined, label: string | null | undefined): boolean {
  if ((code || '').trim().toUpperCase() === 'AGREEMENT') return true
  if ((code || '').trim()) return false
  const text = (label || '').toLowerCase()
  return /\bagreements?\b/.test(text) || /\bsigning\b/.test(text)
}

/**
 * Schedule C lists the booking amount on its own line and the balance of the
 * agreement-signing instalment "at the time of execution of agreement". The
 * booking form keeps those two as one instalment, so the received booking
 * amount is taken out of that instalment here. Nothing else is moved.
 */
export function scheduleCLines(rows: ScheduleSource[], bookingPaidPaise: bigint): { lines: ScheduleLine[]; bookingShown: boolean } {
  const lines: ScheduleLine[] = rows.map((row) => {
    const date = formatLetterDate(row.date)
    const label = date ? (row.label.trim() ? `${row.label.trim()} (${date})` : `On or before ${date}`) : row.label.trim()
    return { code: row.code, label, amountPaise: row.amountPaise }
  })
  const first = lines.findIndex((line) => isAgreementStage(line.code, line.label))
  if (first < 0 || bookingPaidPaise <= 0n || bookingPaidPaise > lines[first].amountPaise) {
    return { lines, bookingShown: false }
  }
  lines[first] = { ...lines[first], code: 'AGREEMENT', amountPaise: lines[first].amountPaise - bookingPaidPaise }
  lines.unshift({ code: 'BOOKING', label: 'At the time of Booking', amountPaise: bookingPaidPaise })
  return { lines, bookingShown: true }
}

/** Boundary names in the spelling the master uses: "Flat No. 504", "OPEN SPACE OF ANANDAM". */
export function boundaryLabel(value: string): string {
  const text = value.trim().replace(/\s+/g, ' ')
  const flat = /^flat\s*no\.?\s*(\S+)$/i.exec(text)
  if (flat) return `Flat No. ${flat[1]}`
  if (/^open space of anandam$/i.test(text)) return 'OPEN SPACE OF ANANDAM'
  return text
}

export function roman(n: number): string {
  const pairs: Array<[number, string]> = [
    [10, 'x'],
    [9, 'ix'],
    [5, 'v'],
    [4, 'iv'],
    [1, 'i'],
  ]
  let rest = n
  let out = ''
  for (const [value, glyph] of pairs) {
    while (rest >= value) {
      out += glyph
      rest -= value
    }
  }
  return out || 'i'
}
