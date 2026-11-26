import { getOwnerTypeForFlat, type OwnerType } from '@/lib/data/flat-ownership'
import { formatPersonName } from '@/lib/booking/person'
import type { BookingLedger } from './load'
import { entryCountsAsReceived, PAYMENT_MODE_LABELS, type LedgerReceipt } from './model'
import { paiseFrom } from '@/lib/demands/engine'

/**
 * Cash statement: money actually received (cleared payments only), one row per
 * cheque or transfer, in date order. Pending cheques, returned payments and
 * expected bank money are not received and are left out.
 */
export interface StatementRow {
  key: string
  bookingId: string
  date: string
  party: string
  mode: string
  reference: string | null
  bank: string | null
  flat: string
  serial: string | null
  principalPaise: bigint
  gstPaise: bigint
  totalPaise: bigint
}

export interface Statement {
  owner: OwnerType
  rows: StatementRow[]
  principalPaise: bigint
  gstPaise: bigint
  totalPaise: bigint
  payments: number
}

/** One actual payment: a recorded receipt, or one cheque / transfer from the booking form. */
interface PaymentPart {
  id: string
  date: string
  mode: string | null
  reference: string | null
  bank: string | null
  payer: string | null
  principalPaise: bigint
  gstPaise: bigint
}

/**
 * The booking form's payments are stored as one combined receipt that carries
 * the first cheque's date and number. For the statement it is split back into
 * the cheques and transfers actually entered, each with its own date and number,
 * when they add up to the receipt. Otherwise the receipt is shown as recorded.
 */
function partsOf(receipt: LedgerReceipt, entries: Array<Record<string, unknown>>): PaymentPart[] {
  const whole: PaymentPart = {
    id: receipt.id,
    date: receipt.date.slice(0, 10),
    mode: receipt.mode,
    reference: receipt.reference,
    bank: receipt.bankName,
    payer: receipt.payerName,
    principalPaise: receipt.principalPaise,
    gstPaise: receipt.gstPaise,
  }
  if (receipt.source !== 'booking_advance') return [whole]
  const received = entries.filter((entry) => entry.status !== 'expected' && entryCountsAsReceived(entry.status as string))
  if (!received.length) return [whole]
  const parts = received.map((entry, index) => ({
    id: `${receipt.id}:${String(entry.id || index)}`,
    date: String(entry.payment_date || receipt.date).slice(0, 10),
    mode: (entry.payment_mode as string) || receipt.mode,
    reference: (entry.reference_no as string) || null,
    bank: (entry.originating_bank as string) || null,
    payer: (entry.payer_name as string) || null,
    principalPaise: paiseFrom(entry.amount),
    gstPaise: paiseFrom(entry.gst_amount),
  }))
  const principal = parts.reduce((sum, part) => sum + part.principalPaise, 0n)
  const gst = parts.reduce((sum, part) => sum + part.gstPaise, 0n)
  if (principal !== receipt.principalPaise || gst !== receipt.gstPaise) return [whole]
  return parts.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

export function buildStatements(ledgers: Iterable<BookingLedger>, range: { from: string; to: string }): Record<OwnerType, Statement> {
  const statements: Record<OwnerType, Statement> = {
    DEVELOPER: { owner: 'DEVELOPER', rows: [], principalPaise: 0n, gstPaise: 0n, totalPaise: 0n, payments: 0 },
    LANDOWNER: { owner: 'LANDOWNER', rows: [], principalPaise: 0n, gstPaise: 0n, totalPaise: 0n, payments: 0 },
  }
  const entered = new Map<string, string>()

  for (const ledger of ledgers) {
    const booking = ledger.booking
    if (booking.deleted_at) continue
    const flat = String(booking.unit_no || '')
    // Same default as the dashboard: a flat not on the landowner list is the developer's.
    const owner: OwnerType = getOwnerTypeForFlat(flat) || 'DEVELOPER'
    const applicant = formatPersonName(booking.applicant_salutation as string, booking.applicant_name as string)

    for (const receipt of ledger.receipts) {
      if (receipt.clearance !== 'cleared') continue
      for (const part of partsOf(receipt, ledger.entries)) {
        if (!part.date || part.date < range.from || part.date > range.to) continue
        if (part.principalPaise <= 0n && part.gstPaise <= 0n) continue
        entered.set(part.id, receipt.createdAt || '')
        statements[owner].rows.push({
          key: part.id,
          bookingId: String(booking.id),
          date: part.date,
          party: part.payer || applicant || '—',
          mode: PAYMENT_MODE_LABELS[part.mode || ''] || part.mode || '—',
          reference: part.reference,
          bank: part.bank,
          flat,
          serial: (booking.serial_display as string) || null,
          principalPaise: part.principalPaise,
          gstPaise: part.gstPaise,
          totalPaise: part.principalPaise + part.gstPaise,
        })
      }
    }
  }

  // Chronological: by payment date, then the order payments were entered.
  for (const statement of Object.values(statements)) {
    statement.rows.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1
      const ea = entered.get(a.key) || ''
      const eb = entered.get(b.key) || ''
      if (ea !== eb) return ea < eb ? -1 : 1
      return a.key < b.key ? -1 : a.key > b.key ? 1 : 0
    })
    for (const row of statement.rows) {
      statement.principalPaise += row.principalPaise
      statement.gstPaise += row.gstPaise
    }
    statement.totalPaise = statement.principalPaise + statement.gstPaise
    statement.payments = statement.rows.length
  }
  return statements
}
