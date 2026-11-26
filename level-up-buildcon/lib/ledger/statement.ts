import { getOwnerTypeForFlat, type OwnerType } from '@/lib/data/flat-ownership'
import { formatPersonName } from '@/lib/booking/person'
import type { BookingLedger } from './load'
import { entryCountsAsReceived, PAYMENT_MODE_LABELS, type LedgerAllocation, type LedgerReceipt } from './model'
import { paiseFrom } from '@/lib/demands/engine'

/**
 * Cash statement: money actually received (cleared payments only), one row per
 * slab a payment paid off, with principal and GST as separate rows. Pending
 * cheques, returned payments and expected bank money are not received and are left out.
 */
export interface StatementRow {
  key: string
  bookingId: string
  date: string
  receiptId: string
  party: string
  mode: string
  reference: string | null
  bank: string | null
  flat: string
  serial: string | null
  slab: string
  kind: 'principal' | 'gst'
  amountPaise: bigint
}

export interface Statement {
  owner: OwnerType
  rows: StatementRow[]
  principalPaise: bigint
  gstPaise: bigint
  totalPaise: bigint
  payments: number
}

export const UNAPPLIED_SLAB = 'Not yet applied to a slab'

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

/**
 * Hands a receipt's slab allocations out to its parts in date order: the
 * earliest payment pays off the earliest slab. Principal and GST separately.
 */
function splitAllocations(parts: PaymentPart[], allocations: LedgerAllocation[], sortOf: (rowId: string) => number) {
  const queue = (kind: 'principalPaise' | 'gstPaise') =>
    [...allocations].sort((a, b) => sortOf(a.scheduleRowId) - sortOf(b.scheduleRowId)).map((item) => ({ item, left: item[kind] }))
  const principalQueue = queue('principalPaise')
  const gstQueue = queue('gstPaise')
  const take = (pool: ReturnType<typeof queue>, amount: bigint) => {
    const pieces: Array<{ item: LedgerAllocation; amount: bigint }> = []
    let need = amount
    for (const slot of pool) {
      if (need <= 0n) break
      if (slot.left <= 0n) continue
      const used = slot.left < need ? slot.left : need
      slot.left -= used
      need -= used
      pieces.push({ item: slot.item, amount: used })
    }
    return { pieces, unapplied: need }
  }
  return parts.map((part) => ({ part, principal: take(principalQueue, part.principalPaise), gst: take(gstQueue, part.gstPaise) }))
}

export function buildStatements(ledgers: Iterable<BookingLedger>, range: { from: string; to: string }): Record<OwnerType, Statement> {
  const statements: Record<OwnerType, Statement> = {
    DEVELOPER: { owner: 'DEVELOPER', rows: [], principalPaise: 0n, gstPaise: 0n, totalPaise: 0n, payments: 0 },
    LANDOWNER: { owner: 'LANDOWNER', rows: [], principalPaise: 0n, gstPaise: 0n, totalPaise: 0n, payments: 0 },
  }
  const order: Array<{ row: StatementRow; created: string; sort: number }> = []

  for (const ledger of ledgers) {
    const booking = ledger.booking
    if (booking.deleted_at) continue
    const flat = String(booking.unit_no || '')
    // Same default as the dashboard: a flat not on the landowner list is the developer's.
    const owner: OwnerType = getOwnerTypeForFlat(flat) || 'DEVELOPER'
    const applicant = formatPersonName(booking.applicant_salutation as string, booking.applicant_name as string)
    const slabs = new Map(ledger.state.installments.map((row) => [row.id, { label: row.label, sort: row.sort }]))

    for (const receipt of ledger.receipts) {
      if (receipt.clearance !== 'cleared') continue
      const own = ledger.allocations.filter((item) => item.receiptId === receipt.id)
      const parts = partsOf(receipt, ledger.entries)
      for (const { part, principal, gst } of splitAllocations(parts, own, (rowId) => slabs.get(rowId)?.sort ?? 0)) {
        const date = part.date
        if (!date || date < range.from || date > range.to) continue
        statements[owner].payments += 1
        const base = {
          bookingId: String(booking.id),
          date,
          receiptId: part.id,
          party: part.payer || applicant || '—',
          mode: PAYMENT_MODE_LABELS[part.mode || ''] || part.mode || '—',
          reference: part.reference,
          bank: part.bank,
          flat,
          serial: (booking.serial_display as string) || null,
        }
        const push = (slab: string, sort: number, kind: StatementRow['kind'], amountPaise: bigint, suffix: string) => {
          if (amountPaise <= 0n) return
          const row: StatementRow = { ...base, key: `${part.id}:${suffix}:${kind}`, slab, kind, amountPaise }
          order.push({ row, created: receipt.createdAt || '', sort })
          statements[owner].rows.push(row)
        }
        // Each slab once per payment, principal then GST.
        const bySlab = new Map<string, { principal: bigint; gst: bigint }>()
        for (const piece of principal.pieces) {
          const current = bySlab.get(piece.item.scheduleRowId) || { principal: 0n, gst: 0n }
          current.principal += piece.amount
          bySlab.set(piece.item.scheduleRowId, current)
        }
        for (const piece of gst.pieces) {
          const current = bySlab.get(piece.item.scheduleRowId) || { principal: 0n, gst: 0n }
          current.gst += piece.amount
          bySlab.set(piece.item.scheduleRowId, current)
        }
        for (const [rowId, amounts] of bySlab) {
          const slab = slabs.get(rowId)
          push(slab?.label || 'Installment', slab?.sort ?? 0, 'principal', amounts.principal, rowId)
          push(slab?.label || 'Installment', slab?.sort ?? 0, 'gst', amounts.gst, rowId)
        }
        push(UNAPPLIED_SLAB, Number.MAX_SAFE_INTEGER, 'principal', principal.unapplied, 'unapplied')
        push(UNAPPLIED_SLAB, Number.MAX_SAFE_INTEGER, 'gst', gst.unapplied, 'unapplied')
      }
    }
  }

  // Chronological: by payment date, then the order payments were entered, then slab order, principal before GST.
  const rank = new Map(
    order
      .sort((a, b) =>
        a.row.date !== b.row.date ? (a.row.date < b.row.date ? -1 : 1)
          : a.created !== b.created ? (a.created < b.created ? -1 : 1)
          : a.row.receiptId !== b.row.receiptId ? (a.row.receiptId < b.row.receiptId ? -1 : 1)
          : a.sort !== b.sort ? a.sort - b.sort
          : a.row.kind === b.row.kind ? 0 : a.row.kind === 'principal' ? -1 : 1
      )
      .map((item, index) => [item.row.key, index])
  )
  for (const statement of Object.values(statements)) {
    statement.rows.sort((a, b) => (rank.get(a.key) ?? 0) - (rank.get(b.key) ?? 0))
    for (const row of statement.rows) {
      if (row.kind === 'gst') statement.gstPaise += row.amountPaise
      else statement.principalPaise += row.amountPaise
    }
    statement.totalPaise = statement.principalPaise + statement.gstPaise
  }
  return statements
}
