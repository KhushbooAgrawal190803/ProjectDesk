import type { SupabaseClient } from '@supabase/supabase-js'
import { considerationOf } from '@/lib/booking/consideration'
import { ACTIVE_BOOKING_STATUSES, paiseFrom, todayInTimeZone } from '@/lib/demands/engine'
import { buildDemandState, ensureBookingAdvance, loadDemandRules, type BookingDemandState } from '@/lib/demands/issue'
import {
  summarizeLedger,
  type ClearanceStatus,
  type LedgerAllocation,
  type LedgerExpected,
  type LedgerReceipt,
  type LedgerSummary,
  type PayerKind,
} from './model'

type Row = Record<string, unknown>

const text = (value: unknown) => {
  const trimmed = value == null ? '' : String(value).trim()
  return trimmed || null
}

function clearanceOf(row: Row): ClearanceStatus {
  const value = String(row.clearance_status || 'cleared')
  return value === 'pending_clearance' || value === 'returned' ? value : 'cleared'
}

export function receiptFromRow(row: Row, allocations: LedgerAllocation[]): LedgerReceipt {
  const own = allocations.filter((item) => item.receiptId === row.id)
  return {
    id: String(row.id),
    source: String(row.source || 'manual'),
    principalPaise: paiseFrom(row.principal_amount),
    gstPaise: paiseFrom(row.gst_amount),
    date: String(row.payment_date || '').slice(0, 10),
    mode: text(row.payment_mode),
    reference: text(row.reference_no),
    remarks: text(row.remarks),
    payerKind: (text(row.payer_kind) as PayerKind | null) ?? null,
    // Before migration 010 the payer is only kept in the remarks, as "Paid by …".
    payerName: text(row.payer_name) ?? (/^Paid by ([^·]+)/.exec(String(row.remarks || ''))?.[1]?.trim() || null),
    bankName: text(row.bank_name),
    clearance: clearanceOf(row),
    notes: text(row.notes),
    expectedEntryId: text(row.expected_entry_id) ?? (/Expected contribution ([0-9a-f-]{36})/i.exec(String(row.remarks || ''))?.[1] || null),
    paymentEntryId: text(row.payment_entry_id),
    createdAt: text(row.created_at),
    allocatedPrincipalPaise: own.reduce((sum, item) => sum + item.principalPaise, 0n),
    allocatedGstPaise: own.reduce((sum, item) => sum + item.gstPaise, 0n),
  }
}

function allocationFromRow(row: Row): LedgerAllocation {
  return {
    id: String(row.id),
    receiptId: String(row.receipt_id),
    scheduleRowId: String(row.schedule_row_id),
    principalPaise: paiseFrom(row.principal_amount),
    gstPaise: paiseFrom(row.gst_amount),
    createdAt: text(row.created_at),
  }
}

function expectedFromEntries(entries: Row[], receipts: LedgerReceipt[]): LedgerExpected[] {
  return entries
    .filter((entry) => entry.status === 'expected')
    .map((entry) => ({
      id: String(entry.id),
      payerName: text(entry.payer_name),
      bankName: text(entry.originating_bank),
      amountPaise: paiseFrom(entry.amount),
      date: text(entry.payment_date),
      fulfilledPaise: receipts
        .filter((receipt) => receipt.expectedEntryId === entry.id && receipt.clearance === 'cleared')
        .reduce((sum, receipt) => sum + receipt.principalPaise, 0n),
    }))
}

/** True once supabase/migrations/010_payment_ledger.sql has been run. Remembered once seen, since a migration is never undone. */
let migrationSeen = false
export async function ledgerMigrationApplied(supabase: SupabaseClient): Promise<boolean> {
  if (migrationSeen) return true
  const { error } = await supabase.from('payment_receipts').select('clearance_status').limit(1)
  if (!error) migrationSeen = true
  return !error
}

export interface BookingLedger {
  booking: Row
  state: BookingDemandState
  receipts: LedgerReceipt[]
  allocations: LedgerAllocation[]
  expected: LedgerExpected[]
  entries: Row[]
  summary: LedgerSummary
  gstPercent: number
  migrationApplied: boolean
}

export async function loadBookingLedger(supabase: SupabaseClient, bookingId: string): Promise<BookingLedger> {
  const ledgers = await loadBookingLedgers(supabase, [bookingId])
  const ledger = ledgers.get(bookingId)
  if (!ledger) throw new Error('Booking not found')
  return ledger
}

/** Rows of `table` whose `column` is in `values`, fetched in chunks that run at the same time. */
async function rowsIn(
  supabase: SupabaseClient,
  table: string,
  column: string,
  values: string[],
  select = '*',
  order: string[] = []
): Promise<{ rows: Row[]; error: string | null }> {
  if (!values.length) return { rows: [], error: null }
  const results = await Promise.all(
    chunks(values).map((part) => {
      let query = supabase.from(table).select(select).in(column, part)
      for (const key of order) query = query.order(key)
      return query
    })
  )
  const failed = results.find((result) => result.error)
  if (failed?.error) return { rows: [], error: failed.error.message }
  return { rows: results.flatMap((result) => (result.data || []) as unknown as Row[]), error: null }
}

function groupBy(rows: Row[], key: string): Map<string, Row[]> {
  const grouped = new Map<string, Row[]>()
  for (const row of rows) {
    const value = String(row[key])
    const list = grouped.get(value)
    if (list) list.push(row)
    else grouped.set(value, [row])
  }
  return grouped
}

/** A booking whose booking-form payments have not been turned into receipts yet. Rare: only older bookings. */
function needsReceiptBackfill(booking: Row, receipts: Row[], entries: Row[]): boolean {
  if (!(ACTIVE_BOOKING_STATUSES as readonly string[]).includes(String(booking.status)) || booking.deleted_at) return false
  const advanceOwed = paiseFrom(booking.booking_amount_paid) > 0n || paiseFrom(booking.gst_collected) > 0n
  if (advanceOwed && !receipts.some((receipt) => receipt.source === 'booking_advance')) return true
  return entries.some(
    (entry) =>
      entry.status === 'pending_clearance' &&
      (paiseFrom(entry.amount) > 0n || paiseFrom(entry.gst_amount) > 0n) &&
      !receipts.some((receipt) => receipt.payment_entry_id === entry.id)
  )
}

/**
 * The ledger of many bookings in two rounds of batched queries, however many
 * bookings there are. Each database round trip is a visible wait, so this
 * replaces running the whole chain of queries once per booking.
 */
export async function loadBookingLedgers(supabase: SupabaseClient, bookingIds: string[]): Promise<Map<string, BookingLedger>> {
  const ledgers = new Map<string, BookingLedger>()
  const ids = [...new Set(bookingIds)]
  if (!ids.length) return ledgers

  const receiptOrder = ['payment_date', 'created_at']
  const [rules, migrationApplied, bookingResult, receiptResult, entryResult, scheduleResult, demandResult, milestoneResult] = await Promise.all([
    loadDemandRules(supabase),
    ledgerMigrationApplied(supabase),
    rowsIn(supabase, 'bookings', 'id', ids),
    rowsIn(supabase, 'payment_receipts', 'booking_id', ids, '*', receiptOrder),
    rowsIn(supabase, 'booking_payment_entries', 'booking_id', ids, '*', ['sort_order']),
    rowsIn(supabase, 'booking_schedule_rows', 'booking_id', ids, '*', ['sort_order']),
    rowsIn(supabase, 'demand_notes', 'booking_id', ids, 'id, booking_id, schedule_row_id, reference_number, payment_deadline, issue_date'),
    supabase.from('construction_milestones').select('id, label, completed_at, project_name'),
  ])
  for (const result of [bookingResult, receiptResult, scheduleResult, demandResult]) {
    if (result.error) throw new Error(result.error)
  }
  if (milestoneResult.error) throw new Error(milestoneResult.error.message)

  const bookings = bookingResult.rows
  const entriesByBooking = groupBy(entryResult.error ? [] : entryResult.rows, 'booking_id')
  let receiptRows = receiptResult.rows
  let receiptsByBooking = groupBy(receiptRows, 'booking_id')

  // Older bookings may still need their booking-form payments recorded as receipts.
  const backfill = bookings.filter((booking) =>
    needsReceiptBackfill(booking, receiptsByBooking.get(String(booking.id)) || [], entriesByBooking.get(String(booking.id)) || [])
  )
  if (backfill.length) {
    await Promise.all(backfill.map((booking) => ensureBookingAdvance(supabase, booking, null).catch(() => undefined)))
    const again = await rowsIn(supabase, 'payment_receipts', 'booking_id', ids, '*', receiptOrder)
    if (again.error) throw new Error(again.error)
    receiptRows = again.rows
    receiptsByBooking = groupBy(receiptRows, 'booking_id')
  }

  const scheduleRows = scheduleResult.rows
  const [byRow, byReceipt] = await Promise.all([
    rowsIn(supabase, 'installment_allocations', 'schedule_row_id', scheduleRows.map((row) => String(row.id)), '*', ['created_at']),
    rowsIn(supabase, 'installment_allocations', 'receipt_id', receiptRows.map((row) => String(row.id)), '*', ['created_at']),
  ])
  if (byRow.error || byReceipt.error) throw new Error(byRow.error || byReceipt.error || 'Allocations are not available.')
  const allocationRows = [...new Map([...byRow.rows, ...byReceipt.rows].map((row) => [String(row.id), row])).values()]
  const allocations = allocationRows.map(allocationFromRow)

  const today = todayInTimeZone(new Date(), rules.timezone)
  const scheduleByBooking = groupBy(scheduleRows, 'booking_id')
  const demandsByBooking = groupBy(demandResult.rows, 'booking_id')
  const milestonesByProject = groupBy((milestoneResult.data || []) as Row[], 'project_name')

  for (const booking of bookings) {
    const bookingId = String(booking.id)
    const ownSchedule = scheduleByBooking.get(bookingId) || []
    const rowIds = new Set(ownSchedule.map((row) => String(row.id)))
    const ownReceiptRows = receiptsByBooking.get(bookingId) || []
    const state = buildDemandState({
      booking,
      rules,
      today,
      schedule: ownSchedule,
      milestones: milestonesByProject.get(String(booking.project_name || 'Anandam')) || [],
      demands: demandsByBooking.get(bookingId) || [],
      receipts: ownReceiptRows,
      allocations: allocationRows.filter((row) => rowIds.has(String(row.schedule_row_id))),
    })
    const receipts = ownReceiptRows.map((row) => receiptFromRow(row, allocations))
    const receiptIds = new Set(receipts.map((receipt) => receipt.id))
    const ownAllocations = allocations.filter((item) => receiptIds.has(item.receiptId) || rowIds.has(item.scheduleRowId))
    const entries = entriesByBooking.get(bookingId) || []
    const expected = expectedFromEntries(entries, receipts)
    const consideration = considerationOf(booking)?.totalPaise ?? 0n
    const summary = summarizeLedger({
      considerationPaise: consideration,
      gstPercent: rules.gstPercent,
      installments: state.installments.map((row) => ({
        id: row.id,
        sort: row.sort,
        label: row.label,
        due: row.due,
        overdue: row.overdue,
        status: row.status,
        deadline: row.deadline,
        principalPaise: row.principalPaise,
        gstPaise: row.gstPaise,
        receivedPaise: row.receivedPaise,
        gstReceivedPaise: row.gstReceivedPaise,
      })),
      receipts,
      expected,
      bookingFormPrincipalPaise: paiseFrom(booking.booking_amount_paid),
      bookingFormGstPaise: paiseFrom(booking.gst_collected),
    })
    ledgers.set(bookingId, { booking, state, receipts, allocations: ownAllocations, expected, entries, summary, gstPercent: rules.gstPercent, migrationApplied })
  }
  return ledgers
}

export interface LedgerTotals {
  receivedPrincipalPaise: bigint
  receivedGstPaise: bigint
  pendingClearancePaise: bigint
  expectedBankPaise: bigint
  unallocatedPaise: bigint
}

const emptyTotals = (): LedgerTotals => ({
  receivedPrincipalPaise: 0n,
  receivedGstPaise: 0n,
  pendingClearancePaise: 0n,
  expectedBankPaise: 0n,
  unallocatedPaise: 0n,
})

function chunks<T>(items: T[], size = 150): T[][] {
  const out: T[][] = []
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size))
  return out
}

/** Received, pending and expected money for many bookings at once, from the same ledger. */
export async function loadLedgerTotals(supabase: SupabaseClient, bookingIds: string[]): Promise<Map<string, LedgerTotals>> {
  const totals = new Map<string, LedgerTotals>()
  for (const id of bookingIds) totals.set(id, emptyTotals())
  if (!bookingIds.length) return totals

  const receiptRows: Row[] = []
  const entryRows: Row[] = []
  for (const part of chunks(bookingIds)) {
    const [receipts, entries] = await Promise.all([
      supabase.from('payment_receipts').select('*').in('booking_id', part),
      supabase.from('booking_payment_entries').select('*').in('booking_id', part).eq('status', 'expected'),
    ])
    if (receipts.error) throw new Error(receipts.error.message)
    receiptRows.push(...(receipts.data || []))
    if (!entries.error) entryRows.push(...(entries.data || []))
  }
  const allocationRows: Row[] = []
  for (const part of chunks(receiptRows.map((row) => String(row.id)))) {
    const { data, error } = await supabase.from('installment_allocations').select('*').in('receipt_id', part)
    if (error) throw new Error(error.message)
    allocationRows.push(...(data || []))
  }
  const allocations = allocationRows.map(allocationFromRow)
  const receipts = receiptRows.map((row) => ({ bookingId: String(row.booking_id), receipt: receiptFromRow(row, allocations) }))

  for (const { bookingId, receipt } of receipts) {
    const total = totals.get(bookingId)
    if (!total) continue
    if (receipt.clearance === 'cleared') {
      total.receivedPrincipalPaise += receipt.principalPaise
      total.receivedGstPaise += receipt.gstPaise
      const unapplied = receipt.principalPaise + receipt.gstPaise - receipt.allocatedPrincipalPaise - receipt.allocatedGstPaise
      if (unapplied > 0n) total.unallocatedPaise += unapplied
    } else if (receipt.clearance === 'pending_clearance') {
      total.pendingClearancePaise += receipt.principalPaise + receipt.gstPaise
    }
  }
  const byBooking = new Map<string, Row[]>()
  for (const entry of entryRows) {
    const list = byBooking.get(String(entry.booking_id)) || []
    list.push(entry)
    byBooking.set(String(entry.booking_id), list)
  }
  for (const [bookingId, entries] of byBooking) {
    const total = totals.get(bookingId)
    if (!total) continue
    const own = receipts.filter((item) => item.bookingId === bookingId).map((item) => item.receipt)
    total.expectedBankPaise += expectedFromEntries(entries, own).reduce(
      (sum, item) => sum + (item.amountPaise > item.fulfilledPaise ? item.amountPaise - item.fulfilledPaise : 0n),
      0n
    )
  }
  return totals
}

/** Allocated money per schedule row, for pages that list installments across bookings. */
export async function loadAllocatedByRow(supabase: SupabaseClient, rowIds: string[]) {
  const allocated = new Map<string, { principalPaise: bigint; gstPaise: bigint }>()
  for (const part of chunks(rowIds)) {
    const { data, error } = await supabase.from('installment_allocations').select('schedule_row_id, principal_amount, gst_amount').in('schedule_row_id', part)
    if (error) throw new Error(error.message)
    for (const row of data || []) {
      const current = allocated.get(row.schedule_row_id) || { principalPaise: 0n, gstPaise: 0n }
      current.principalPaise += paiseFrom(row.principal_amount)
      current.gstPaise += paiseFrom(row.gst_amount)
      allocated.set(row.schedule_row_id, current)
    }
  }
  return allocated
}
