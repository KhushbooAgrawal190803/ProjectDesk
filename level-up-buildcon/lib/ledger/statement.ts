import { getOwnerTypeForFlat, type OwnerType } from '@/lib/data/flat-ownership'
import { formatPersonName } from '@/lib/booking/person'
import type { BookingLedger } from './load'
import { PAYMENT_MODE_LABELS } from './model'

/**
 * Cash statement: money actually received (cleared payments only), one row per
 * slab a payment paid off, with principal and GST as separate rows. Pending
 * cheques, returned payments and expected bank money are not received and are left out.
 */
export interface StatementRow {
  key: string
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
      const date = receipt.date.slice(0, 10)
      if (!date || date < range.from || date > range.to) continue
      statements[owner].payments += 1
      const base = {
        date,
        receiptId: receipt.id,
        party: receipt.payerName || applicant || '—',
        mode: PAYMENT_MODE_LABELS[receipt.mode || ''] || receipt.mode || '—',
        reference: receipt.reference,
        bank: receipt.bankName,
        flat,
        serial: (booking.serial_display as string) || null,
      }
      const push = (slab: string, sort: number, kind: StatementRow['kind'], amountPaise: bigint, suffix: string) => {
        if (amountPaise <= 0n) return
        const row: StatementRow = { ...base, key: `${receipt.id}:${suffix}:${kind}`, slab, kind, amountPaise }
        order.push({ row, created: receipt.createdAt || '', sort })
        statements[owner].rows.push(row)
      }
      const own = ledger.allocations.filter((item) => item.receiptId === receipt.id)
      for (const item of own) {
        const slab = slabs.get(item.scheduleRowId)
        push(slab?.label || 'Installment', slab?.sort ?? 0, 'principal', item.principalPaise, item.id)
        push(slab?.label || 'Installment', slab?.sort ?? 0, 'gst', item.gstPaise, item.id)
      }
      const leftPrincipal = receipt.principalPaise - own.reduce((sum, item) => sum + item.principalPaise, 0n)
      const leftGst = receipt.gstPaise - own.reduce((sum, item) => sum + item.gstPaise, 0n)
      push(UNAPPLIED_SLAB, Number.MAX_SAFE_INTEGER, 'principal', leftPrincipal, 'unapplied')
      push(UNAPPLIED_SLAB, Number.MAX_SAFE_INTEGER, 'gst', leftGst, 'unapplied')
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
