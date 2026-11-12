'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin, requireStaff } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { formatInr, hundredthsToString, toHundredths } from '@/lib/booking/money'
import { formatLetterDate } from '@/lib/documents/inr-words'
import { reconcileBooking } from '@/lib/demands/issue'
import { loadBookingLedger } from '@/lib/ledger/load'
import { planAllocations, type PayerKind } from '@/lib/ledger/model'

const MODES = ['Cash', 'Cheque', 'NEFT_RTGS', 'UPI', 'Other']
const PAYERS: PayerKind[] = ['applicant', 'coapplicant', 'bank', 'other']

function refresh(bookingId: string) {
  revalidatePath(`/bookings/${bookingId}`)
  revalidatePath('/accounts')
  revalidatePath('/demand-notes')
  revalidatePath('/dashboard')
}

export interface AllocationPreviewRow {
  receiptId: string
  receiptLabel: string
  scheduleRowId: string
  installmentLabel: string
  principal: string
  gst: string
}

/** Cleared money that is not yet applied, and where it would go. Nothing is written. */
export async function previewReceiptAllocation(bookingId: string): Promise<AllocationPreviewRow[]> {
  await requireStaff()
  const supabase = await createClient()
  const ledger = await loadBookingLedger(supabase, bookingId)
  return describePlan(ledger)
}

function describePlan(ledger: Awaited<ReturnType<typeof loadBookingLedger>>): AllocationPreviewRow[] {
  const plan = planAllocations(
    ledger.state.installments.map((row) => ({
      id: row.id,
      sort: row.sort,
      principalPaise: row.principalPaise,
      gstPaise: row.gstPaise,
      receivedPaise: row.receivedPaise,
      gstReceivedPaise: row.gstReceivedPaise,
    })),
    ledger.receipts
  )
  const installment = new Map(ledger.state.installments.map((row, index) => [row.id, `${index + 1}. ${row.label}`]))
  const receipt = new Map(
    ledger.receipts.map((item) => [item.id, `${formatLetterDate(item.date) || 'Undated'} · ${formatInr(item.principalPaise)}${item.payerName ? ` · ${item.payerName}` : ''}`])
  )
  return plan.map((item) => ({
    receiptId: item.receiptId,
    receiptLabel: receipt.get(item.receiptId) || 'Receipt',
    scheduleRowId: item.scheduleRowId,
    installmentLabel: installment.get(item.scheduleRowId) || 'Installment',
    principal: hundredthsToString(item.principalPaise),
    gst: hundredthsToString(item.gstPaise),
  }))
}

/**
 * Apply the previewed plan. The plan is recalculated from the ledger here, so a stale
 * preview cannot apply money twice; the database trigger also caps every row.
 */
export async function applyReceiptAllocation(bookingId: string) {
  const profile = await requireStaff()
  const supabase = await createClient()
  const ledger = await loadBookingLedger(supabase, bookingId)
  const plan = describePlan(ledger)
  if (!plan.length) return { applied: 0 }
  let applied = 0
  for (const item of plan) {
    const { error } = await supabase.from('installment_allocations').insert({
      receipt_id: item.receiptId,
      schedule_row_id: item.scheduleRowId,
      principal_amount: item.principal,
      gst_amount: item.gst,
      created_by: profile.id,
    })
    if (error) {
      if (applied) await auditAllocation(supabase, bookingId, profile.id, plan.slice(0, applied), 'stopped early')
      throw new Error(`Allocation stopped after ${applied} of ${plan.length} rows: ${error.message}`)
    }
    applied += 1
  }
  await auditAllocation(supabase, bookingId, profile.id, plan, null)
  await reconcileBooking(supabase, bookingId, { actorId: profile.id }).catch(() => undefined)
  refresh(bookingId)
  return { applied }
}

async function auditAllocation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bookingId: string,
  actorId: string,
  rows: AllocationPreviewRow[],
  note: string | null
) {
  await supabase.from('booking_audit_log').insert({
    booking_id: bookingId,
    changed_by: actorId,
    action: 'RECEIPT_ALLOCATED',
    reason: `Received money applied to ${rows.length} installment row${rows.length === 1 ? '' : 's'}${note ? ` (${note})` : ''}`,
    diff_json: { allocations: rows },
  })
}

export interface RecordPaymentInput {
  bookingId: string
  payerKind: PayerKind
  payerCoapplicantId?: string | null
  payerName?: string | null
  principal: string
  gst: string
  paymentDate: string
  paymentMode: string
  paymentModeDetail?: string | null
  reference?: string | null
  bankName?: string | null
  status: 'cleared' | 'pending_clearance'
  notes?: string | null
  expectedEntryId?: string | null
  allocations: Array<{ scheduleRowId: string; principal: string; gst: string }>
}

/** One receipt, optionally split across installments, written in one transaction. */
export async function recordBookingPayment(input: RecordPaymentInput) {
  const profile = await requireStaff()
  const supabase = await createClient()
  if (!PAYERS.includes(input.payerKind)) throw new Error('Choose who paid')
  if (!MODES.includes(input.paymentMode)) throw new Error('Choose a payment mode')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.paymentDate)) throw new Error('Enter the payment date')
  const principal = toHundredths(input.principal || 0)
  const gst = toHundredths(input.gst || 0)
  if (principal == null || gst == null || principal < 0n || gst < 0n) throw new Error('Amounts cannot be negative')
  if (principal === 0n && gst === 0n) throw new Error('Enter the amount received')

  const ledger = await loadBookingLedger(supabase, input.bookingId)
  if (!ledger.migrationApplied && input.status !== 'cleared') {
    throw new Error('Cheques awaiting clearance need the payment ledger update (migration 010). Record it once cleared, or run the migration first.')
  }
  const rows = new Map(ledger.state.installments.map((row) => [row.id, row]))
  let allocatedPrincipal = 0n
  let allocatedGst = 0n
  const allocations = input.allocations
    .map((item) => ({
      scheduleRowId: item.scheduleRowId,
      principal: toHundredths(item.principal || 0) ?? 0n,
      gst: toHundredths(item.gst || 0) ?? 0n,
    }))
    .filter((item) => item.principal > 0n || item.gst > 0n)
  for (const item of allocations) {
    const row = rows.get(item.scheduleRowId)
    if (!row) throw new Error('An installment in this payment is not on this booking')
    if (item.principal < 0n || item.gst < 0n) throw new Error('Allocation amounts cannot be negative')
    if (item.principal > row.outstandingPrincipalPaise) {
      throw new Error(`${row.label}: principal ${formatInr(item.principal)} is more than the ${formatInr(row.outstandingPrincipalPaise)} outstanding`)
    }
    if (item.gst > row.outstandingGstPaise) {
      throw new Error(`${row.label}: GST ${formatInr(item.gst)} is more than the ${formatInr(row.outstandingGstPaise)} outstanding`)
    }
    allocatedPrincipal += item.principal
    allocatedGst += item.gst
  }
  if (allocatedPrincipal > principal || allocatedGst > gst) {
    throw new Error('The amounts applied to installments add up to more than the payment')
  }
  if (input.status !== 'cleared' && allocations.length) {
    throw new Error('A payment awaiting clearance is applied to installments when it clears')
  }
  if (input.expectedEntryId) {
    const expected = ledger.expected.find((item) => item.id === input.expectedEntryId)
    if (!expected) throw new Error('The expected bank contribution was not found on this booking')
  }

  const payerName = String(input.payerName || '').trim() || null
  if (ledger.migrationApplied) {
    const { error } = await supabase.rpc('record_booking_payment', {
      p_booking_id: input.bookingId,
      p_principal: hundredthsToString(principal),
      p_gst: hundredthsToString(gst),
      p_payment_date: input.paymentDate,
      p_payment_mode: input.paymentMode,
      p_reference: input.reference || null,
      p_payer_kind: input.payerKind,
      p_payer_name: payerName,
      p_bank_name: input.bankName || null,
      p_clearance_status: input.status,
      p_notes: [input.paymentModeDetail, input.notes].filter(Boolean).join(' · ') || null,
      p_expected_entry_id: input.expectedEntryId || null,
      p_payment_entry_id: null,
      p_allocations: allocations.map((item) => ({
        schedule_row_id: item.scheduleRowId,
        principal: hundredthsToString(item.principal),
        gst: hundredthsToString(item.gst),
      })),
      p_user: profile.id,
    })
    if (error) throw new Error(error.message)
  } else {
    await recordWithoutLedgerMigration(supabase, profile.id, input, principal, gst, allocations, payerName)
  }

  await supabase.from('booking_audit_log').insert({
    booking_id: input.bookingId,
    changed_by: profile.id,
    action: 'PAYMENT_RECORDED',
    reason: `${formatInr(principal)}${gst > 0n ? ` + GST ${formatInr(gst)}` : ''} from ${payerName || input.payerKind} by ${input.paymentMode}${input.status === 'pending_clearance' ? ', awaiting clearance' : ''}`,
    diff_json: {
      principal: hundredthsToString(principal),
      gst: hundredthsToString(gst),
      payment_date: input.paymentDate,
      reference: input.reference || null,
      allocations: allocations.map((item) => ({ schedule_row_id: item.scheduleRowId, principal: hundredthsToString(item.principal), gst: hundredthsToString(item.gst) })),
    },
  })
  await reconcileBooking(supabase, input.bookingId, { actorId: profile.id }).catch(() => undefined)
  refresh(input.bookingId)
  return { success: true }
}

/**
 * Before migration 010 there is no multi-row function. A single allocation uses the
 * existing atomic function; otherwise the receipt is written first and each row is
 * capped by the allocation trigger. A failure is reported with the receipt id so it
 * can be applied from the booking page; the receipt itself is never duplicated.
 */
async function recordWithoutLedgerMigration(
  supabase: Awaited<ReturnType<typeof createClient>>,
  actorId: string,
  input: RecordPaymentInput,
  principal: bigint,
  gst: bigint,
  allocations: Array<{ scheduleRowId: string; principal: bigint; gst: bigint }>,
  payerName: string | null
) {
  const remarks = [
    payerName ? `Paid by ${payerName}` : null,
    input.bankName ? `Bank: ${input.bankName}` : null,
    input.expectedEntryId ? `Expected contribution ${input.expectedEntryId}` : null,
    input.paymentModeDetail,
    input.notes,
  ]
    .filter(Boolean)
    .join(' · ') || null
  const single = allocations.length === 1 && allocations[0].principal === principal && allocations[0].gst === gst
  if (single && !input.expectedEntryId) {
    const { error } = await supabase.rpc('create_receipt_and_allocate', {
      p_booking_id: input.bookingId,
      p_schedule_row_id: allocations[0].scheduleRowId,
      p_principal: hundredthsToString(principal),
      p_gst: hundredthsToString(gst),
      p_payment_date: input.paymentDate,
      p_payment_mode: input.paymentMode,
      p_reference: input.reference || null,
      p_remarks: remarks,
      p_user: actorId,
    })
    if (error) throw new Error(error.message)
    return
  }
  const { data: receipt, error } = await supabase
    .from('payment_receipts')
    .insert({
      booking_id: input.bookingId,
      source: 'manual',
      principal_amount: hundredthsToString(principal),
      gst_amount: hundredthsToString(gst),
      payment_date: input.paymentDate,
      payment_mode: input.paymentMode,
      reference_no: input.reference || null,
      remarks,
      recorded_by: actorId,
    })
    .select('id')
    .single()
  if (error || !receipt) throw new Error(error?.message || 'The payment could not be saved')
  for (const item of allocations) {
    const { error: allocationError } = await supabase.from('installment_allocations').insert({
      receipt_id: receipt.id,
      schedule_row_id: item.scheduleRowId,
      principal_amount: hundredthsToString(item.principal),
      gst_amount: hundredthsToString(item.gst),
      created_by: actorId,
    })
    if (allocationError) {
      throw new Error(`The payment is saved, but applying it stopped: ${allocationError.message}. Use "Apply received money" on the booking to finish.`)
    }
  }
}

/** Clear or return a cheque. A cleared cheque is then applied in schedule order. */
export async function setReceiptClearance(input: { bookingId: string; receiptId: string; status: 'cleared' | 'returned'; clearedOn?: string | null }) {
  const profile = await requireStaff()
  const supabase = await createClient()
  const { error } = await supabase.rpc('set_receipt_clearance', {
    p_receipt_id: input.receiptId,
    p_status: input.status,
    p_cleared_on: input.clearedOn || null,
    p_allocations: [],
    p_user: profile.id,
  })
  if (error) throw new Error(error.message)
  await supabase.from('booking_audit_log').insert({
    booking_id: input.bookingId,
    changed_by: profile.id,
    action: input.status === 'cleared' ? 'CHEQUE_CLEARED' : 'CHEQUE_RETURNED',
    reason: input.status === 'cleared' ? 'Payment marked cleared' : 'Payment marked failed / returned. It is not counted as received.',
    diff_json: { receipt_id: input.receiptId, cleared_on: input.clearedOn || null },
  })
  if (input.status === 'cleared') await applyReceiptAllocation(input.bookingId)
  refresh(input.bookingId)
  return { success: true }
}

/** Admin correction. The receipt stays; only the wrong allocation row is removed. */
export async function reverseAllocation(input: { bookingId: string; allocationId: string; reason: string }) {
  const profile = await requireAdmin()
  const supabase = await createClient()
  if (!input.reason.trim()) throw new Error('Give a reason for the correction')
  const { data: row } = await supabase.from('installment_allocations').select('*').eq('id', input.allocationId).maybeSingle()
  if (!row) throw new Error('Allocation not found')
  const { error } = await supabase.rpc('reverse_installment_allocation', { p_allocation_id: input.allocationId })
  if (error) {
    if (/function|schema cache/i.test(error.message)) {
      throw new Error('Allocation corrections need the payment ledger update (migration 010).')
    }
    throw new Error(error.message)
  }
  await supabase.from('booking_audit_log').insert({
    booking_id: input.bookingId,
    changed_by: profile.id,
    action: 'ALLOCATION_REVERSED',
    reason: input.reason.trim(),
    diff_json: { removed: row },
  })
  refresh(input.bookingId)
  return { success: true }
}
