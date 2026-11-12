/**
 * One payment ledger for a booking: receipts (money actually paid), their
 * allocations to installments, and expected bank contributions (never money received).
 * Pure functions only, so the booking page, payments page, dashboard and demand
 * notes all read the same numbers.
 */

export type ClearanceStatus = 'cleared' | 'pending_clearance' | 'returned'
export type PayerKind = 'applicant' | 'coapplicant' | 'bank' | 'other'

/** Booking-form payment statuses. 'received' is the pre-ledger name for 'cleared'. */
export type EntryStatus = 'received' | 'cleared' | 'pending_clearance' | 'returned' | 'expected'

export const ENTRY_STATUS_LABELS: Record<EntryStatus, string> = {
  received: 'Received',
  cleared: 'Cleared',
  pending_clearance: 'Pending Clearance',
  returned: 'Failed / Returned',
  expected: 'Expected',
}

export const CLEARANCE_LABELS: Record<ClearanceStatus, string> = {
  cleared: 'Cleared',
  pending_clearance: 'Pending Clearance',
  returned: 'Failed / Returned',
}

/** Money that has actually arrived and can be applied to an installment. */
export function entryCountsAsReceived(status: string | null | undefined): boolean {
  return !status || status === 'received' || status === 'cleared'
}

export function normalizeEntryStatus(status: unknown): EntryStatus {
  const value = String(status || '')
  if (value === 'cleared' || value === 'pending_clearance' || value === 'returned' || value === 'expected') return value
  return 'received'
}

export interface LedgerAllocation {
  id: string
  receiptId: string
  scheduleRowId: string
  principalPaise: bigint
  gstPaise: bigint
  createdAt: string | null
}

export interface LedgerReceipt {
  id: string
  source: string
  principalPaise: bigint
  gstPaise: bigint
  date: string
  mode: string | null
  reference: string | null
  remarks: string | null
  payerKind: PayerKind | null
  payerName: string | null
  bankName: string | null
  clearance: ClearanceStatus
  notes: string | null
  expectedEntryId: string | null
  paymentEntryId: string | null
  createdAt: string | null
  allocatedPrincipalPaise: bigint
  allocatedGstPaise: bigint
}

export interface LedgerExpected {
  id: string
  payerName: string | null
  bankName: string | null
  amountPaise: bigint
  date: string | null
  fulfilledPaise: bigint
}

export interface LedgerInstallmentInput {
  id: string
  sort: number
  label: string
  due: boolean
  overdue: boolean
  status: string
  deadline: string | null
  principalPaise: bigint
  gstPaise: bigint
  receivedPaise: bigint
  gstReceivedPaise: bigint
}

export interface LedgerSummary {
  considerationPaise: bigint
  gstPayablePaise: bigint
  payablePaise: bigint
  receivedPrincipalPaise: bigint
  receivedGstPaise: bigint
  receivedTotalPaise: bigint
  pendingClearancePaise: bigint
  returnedPaise: bigint
  expectedBankPaise: bigint
  unallocatedPrincipalPaise: bigint
  unallocatedGstPaise: bigint
  outstandingPaise: bigint
  overpaymentPaise: bigint
  overduePaise: bigint
  dueNowPaise: bigint
  progressPercent: number
  nextDue: { id: string; label: string; outstandingPaise: bigint; deadline: string | null; due: boolean } | null
  warnings: string[]
}

const zero = 0n
const positive = (value: bigint) => (value > zero ? value : zero)

export function summarizeLedger(input: {
  considerationPaise: bigint
  gstPercent: number
  installments: LedgerInstallmentInput[]
  receipts: LedgerReceipt[]
  expected: LedgerExpected[]
  /** booking_amount_paid / gst_collected as stored on the booking row. */
  bookingFormPrincipalPaise?: bigint
  bookingFormGstPaise?: bigint
}): LedgerSummary {
  const gstPayable = input.installments.length
    ? input.installments.reduce((sum, row) => sum + row.gstPaise, zero)
    : (input.considerationPaise * BigInt(Math.round(input.gstPercent * 100)) + 5000n) / 10000n
  const payable = input.considerationPaise + gstPayable

  let receivedPrincipal = zero
  let receivedGst = zero
  let pending = zero
  let returned = zero
  let allocatedPrincipal = zero
  let allocatedGst = zero
  for (const receipt of input.receipts) {
    if (receipt.clearance === 'cleared') {
      receivedPrincipal += receipt.principalPaise
      receivedGst += receipt.gstPaise
      allocatedPrincipal += receipt.allocatedPrincipalPaise
      allocatedGst += receipt.allocatedGstPaise
    } else if (receipt.clearance === 'pending_clearance') {
      pending += receipt.principalPaise + receipt.gstPaise
    } else {
      returned += receipt.principalPaise + receipt.gstPaise
    }
  }
  const receivedTotal = receivedPrincipal + receivedGst
  const expectedBank = input.expected.reduce((sum, item) => sum + positive(item.amountPaise - item.fulfilledPaise), zero)

  let overdue = zero
  let dueNow = zero
  let firstDue: LedgerSummary['nextDue'] = null
  let firstUpcoming: LedgerSummary['nextDue'] = null
  const ordered = [...input.installments].sort((a, b) => a.sort - b.sort)
  for (const row of ordered) {
    const outstanding = positive(row.principalPaise - row.receivedPaise) + positive(row.gstPaise - row.gstReceivedPaise)
    if (outstanding <= zero) continue
    if (row.overdue) overdue += outstanding
    if (row.due) dueNow += outstanding
    const item = { id: row.id, label: row.label, outstandingPaise: outstanding, deadline: row.deadline, due: row.due }
    if (row.due && !firstDue) firstDue = item
    if (!row.due && !firstUpcoming) firstUpcoming = item
  }
  const nextDue = firstDue || firstUpcoming

  const warnings: string[] = []
  const unallocatedPrincipal = positive(receivedPrincipal - allocatedPrincipal)
  const unallocatedGst = positive(receivedGst - allocatedGst)
  if (unallocatedPrincipal > zero || unallocatedGst > zero) {
    warnings.push('Some received money is not applied to an installment yet.')
  }
  if (receivedPrincipal > input.considerationPaise) {
    warnings.push('Principal received is more than the Total Consideration.')
  }
  if (input.bookingFormPrincipalPaise != null) {
    const bookingReceipts = input.receipts.filter((receipt) => receipt.source === 'booking_advance')
    const recorded = bookingReceipts.reduce((sum, receipt) => sum + receipt.principalPaise, zero)
    if (bookingReceipts.length && recorded !== input.bookingFormPrincipalPaise) {
      warnings.push('The booking amount on the booking form differs from the booking receipt on file.')
    }
  }

  const progress = payable > zero ? Number((receivedTotal * 10000n) / payable) / 100 : 0
  return {
    considerationPaise: input.considerationPaise,
    gstPayablePaise: gstPayable,
    payablePaise: payable,
    receivedPrincipalPaise: receivedPrincipal,
    receivedGstPaise: receivedGst,
    receivedTotalPaise: receivedTotal,
    pendingClearancePaise: pending,
    returnedPaise: returned,
    expectedBankPaise: expectedBank,
    unallocatedPrincipalPaise: unallocatedPrincipal,
    unallocatedGstPaise: unallocatedGst,
    outstandingPaise: positive(payable - receivedTotal),
    overpaymentPaise: positive(receivedTotal - payable),
    overduePaise: overdue,
    dueNowPaise: dueNow,
    progressPercent: Math.min(100, progress),
    nextDue,
    warnings,
  }
}

export interface PlannedAllocation {
  receiptId: string
  scheduleRowId: string
  principalPaise: bigint
  gstPaise: bigint
}

/**
 * Apply cleared, unapplied money to installments in schedule order,
 * starting with the booking installment. Principal and GST are capped separately.
 * Receipts awaiting clearance and expected bank money are never applied.
 */
export function planAllocations(
  installments: Pick<LedgerInstallmentInput, 'id' | 'sort' | 'principalPaise' | 'gstPaise' | 'receivedPaise' | 'gstReceivedPaise'>[],
  receipts: Pick<LedgerReceipt, 'id' | 'clearance' | 'principalPaise' | 'gstPaise' | 'allocatedPrincipalPaise' | 'allocatedGstPaise'>[]
): PlannedAllocation[] {
  const rows = [...installments]
    .sort((a, b) => a.sort - b.sort)
    .map((row) => ({
      id: row.id,
      principal: positive(row.principalPaise - row.receivedPaise),
      gst: positive(row.gstPaise - row.gstReceivedPaise),
    }))
  const plan: PlannedAllocation[] = []
  for (const receipt of receipts) {
    if (receipt.clearance !== 'cleared') continue
    let principal = positive(receipt.principalPaise - receipt.allocatedPrincipalPaise)
    let gst = positive(receipt.gstPaise - receipt.allocatedGstPaise)
    for (const row of rows) {
      if (principal <= zero && gst <= zero) break
      const takePrincipal = principal < row.principal ? principal : row.principal
      const takeGst = gst < row.gst ? gst : row.gst
      if (takePrincipal <= zero && takeGst <= zero) continue
      row.principal -= takePrincipal
      row.gst -= takeGst
      principal -= takePrincipal
      gst -= takeGst
      plan.push({ receiptId: receipt.id, scheduleRowId: row.id, principalPaise: takePrincipal, gstPaise: takeGst })
    }
  }
  return plan
}

/** Split a payment amount across chosen installments in order, principal first then GST per row. */
export function splitAcrossInstallments(
  amount: { principal: bigint; gst: bigint },
  rows: Array<{ id: string; outstandingPrincipalPaise: bigint; outstandingGstPaise: bigint }>
): { allocations: Array<{ scheduleRowId: string; principalPaise: bigint; gstPaise: bigint }>; leftover: { principal: bigint; gst: bigint } } {
  let principal = amount.principal
  let gst = amount.gst
  const allocations: Array<{ scheduleRowId: string; principalPaise: bigint; gstPaise: bigint }> = []
  for (const row of rows) {
    const takePrincipal = principal < row.outstandingPrincipalPaise ? principal : row.outstandingPrincipalPaise
    const takeGst = gst < row.outstandingGstPaise ? gst : row.outstandingGstPaise
    if (takePrincipal <= zero && takeGst <= zero) continue
    allocations.push({ scheduleRowId: row.id, principalPaise: positive(takePrincipal), gstPaise: positive(takeGst) })
    principal -= positive(takePrincipal)
    gst -= positive(takeGst)
  }
  return { allocations, leftover: { principal, gst } }
}

export const PAYMENT_MODE_LABELS: Record<string, string> = {
  Cash: 'Cash',
  Cheque: 'Cheque',
  NEFT_RTGS: 'NEFT / RTGS',
  UPI: 'UPI',
  Other: 'Other',
}

/** Fields that apply to each payment mode, so forms only ask for what is relevant. */
export function modeFields(mode: string | null | undefined): { reference: string | null; bank: boolean; clearance: boolean } {
  switch (mode) {
    case 'Cheque':
      return { reference: 'Cheque number', bank: true, clearance: true }
    case 'NEFT_RTGS':
      return { reference: 'UTR / transaction number', bank: true, clearance: false }
    case 'UPI':
      return { reference: 'UPI transaction ID', bank: false, clearance: false }
    case 'Cash':
      return { reference: 'Receipt number', bank: false, clearance: false }
    case 'Other':
      return { reference: 'Reference', bank: true, clearance: true }
    default:
      return { reference: 'Reference', bank: false, clearance: false }
  }
}
