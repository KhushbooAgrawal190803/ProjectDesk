import type { SupabaseClient } from '@supabase/supabase-js'
import { considerationOf } from '@/lib/booking/consideration'
import { paiseFrom } from '@/lib/demands/engine'
import { getBookingDemandState, loadDemandRules, type BookingDemandState } from '@/lib/demands/issue'
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

/** True once supabase/migrations/010_payment_ledger.sql has been run. */
export async function ledgerMigrationApplied(supabase: SupabaseClient): Promise<boolean> {
  const { error } = await supabase.from('payment_receipts').select('clearance_status').limit(1)
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
  const [state, rules] = await Promise.all([getBookingDemandState(supabase, bookingId), loadDemandRules(supabase)])
  const [bookingResult, receiptResult, entryResult, migrationApplied] = await Promise.all([
    supabase.from('bookings').select('*').eq('id', bookingId).single(),
    supabase.from('payment_receipts').select('*').eq('booking_id', bookingId).order('payment_date').order('created_at'),
    supabase.from('booking_payment_entries').select('*').eq('booking_id', bookingId).order('sort_order'),
    ledgerMigrationApplied(supabase),
  ])
  if (bookingResult.error || !bookingResult.data) throw new Error('Booking not found')
  if (receiptResult.error) throw new Error(receiptResult.error.message)
  const receiptRows = receiptResult.data || []
  const { data: allocationRows, error: allocationError } = receiptRows.length
    ? await supabase.from('installment_allocations').select('*').in('receipt_id', receiptRows.map((row) => row.id)).order('created_at')
    : { data: [], error: null }
  if (allocationError) throw new Error(allocationError.message)

  const allocations = (allocationRows || []).map(allocationFromRow)
  const receipts = receiptRows.map((row) => receiptFromRow(row, allocations))
  const entries = entryResult.error ? [] : entryResult.data || []
  const expected = expectedFromEntries(entries, receipts)
  const booking = bookingResult.data as Row
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
  return { booking, state, receipts, allocations, expected, entries, summary, gstPercent: rules.gstPercent, migrationApplied }
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
