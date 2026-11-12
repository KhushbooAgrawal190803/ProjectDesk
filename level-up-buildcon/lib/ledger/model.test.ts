import { describe, expect, it } from 'vitest'
import {
  entryCountsAsReceived,
  normalizeEntryStatus,
  planAllocations,
  splitAcrossInstallments,
  summarizeLedger,
  type LedgerInstallmentInput,
  type LedgerReceipt,
} from './model'

const L = (rupees: number) => BigInt(Math.round(rupees * 100))

function installment(id: string, sort: number, principal: number, received = 0, gstReceived = 0, extra: Partial<LedgerInstallmentInput> = {}): LedgerInstallmentInput {
  return {
    id,
    sort,
    label: id,
    due: sort === 1,
    overdue: false,
    status: 'Due',
    deadline: null,
    principalPaise: L(principal),
    gstPaise: L(principal * 0.05),
    receivedPaise: L(received),
    gstReceivedPaise: L(gstReceived),
    ...extra,
  }
}

function receipt(id: string, principal: number, gst: number, extra: Partial<LedgerReceipt> = {}): LedgerReceipt {
  return {
    id,
    source: 'manual',
    principalPaise: L(principal),
    gstPaise: L(gst),
    date: '2026-11-10',
    mode: 'NEFT_RTGS',
    reference: null,
    remarks: null,
    payerKind: 'applicant',
    payerName: null,
    bankName: null,
    clearance: 'cleared',
    notes: null,
    expectedEntryId: null,
    paymentEntryId: null,
    createdAt: null,
    allocatedPrincipalPaise: 0n,
    allocatedGstPaise: 0n,
    ...extra,
  }
}

describe('payment statuses', () => {
  it('counts only received and cleared money', () => {
    expect(entryCountsAsReceived('received')).toBe(true)
    expect(entryCountsAsReceived('cleared')).toBe(true)
    expect(entryCountsAsReceived(undefined)).toBe(true)
    expect(entryCountsAsReceived('pending_clearance')).toBe(false)
    expect(entryCountsAsReceived('returned')).toBe(false)
    expect(entryCountsAsReceived('expected')).toBe(false)
    expect(normalizeEntryStatus('something')).toBe('received')
  })
})

describe('booking ledger summary', () => {
  // Flat 506: Total Consideration ₹71,01,000; booking installment 20% = ₹14,20,200.
  const rows = [installment('booking', 1, 1420200), installment('basement', 2, 710100)]

  it('keeps expected bank money and pending cheques out of money received', () => {
    const summary = summarizeLedger({
      considerationPaise: L(2130300),
      gstPercent: 5,
      installments: rows,
      receipts: [
        receipt('purchaser', 710100, 35505),
        receipt('cheque', 100000, 5000, { clearance: 'pending_clearance' }),
        receipt('bounced', 50000, 0, { clearance: 'returned' }),
      ],
      expected: [{ id: 'bank', payerName: 'Bank', bankName: 'Canara', amountPaise: L(710100), date: null, fulfilledPaise: 0n }],
    })
    expect(summary.receivedPrincipalPaise).toBe(L(710100))
    expect(summary.receivedGstPaise).toBe(L(35505))
    expect(summary.receivedTotalPaise).toBe(L(745605))
    expect(summary.pendingClearancePaise).toBe(L(105000))
    expect(summary.returnedPaise).toBe(L(50000))
    expect(summary.expectedBankPaise).toBe(L(710100))
    // Payable is consideration plus GST on every installment; expected money is still outstanding.
    expect(summary.payablePaise).toBe(L(2130300 + 106515))
    expect(summary.outstandingPaise).toBe(L(2130300 + 106515 - 745605))
  })

  it('reduces expected bank money once the disbursement has arrived, without counting it twice', () => {
    const summary = summarizeLedger({
      considerationPaise: L(2130300),
      gstPercent: 5,
      installments: rows,
      receipts: [receipt('bank-paid', 710100, 0, { payerKind: 'bank', expectedEntryId: 'bank' })],
      expected: [{ id: 'bank', payerName: 'Bank', bankName: 'Canara', amountPaise: L(710100), date: null, fulfilledPaise: L(710100) }],
    })
    expect(summary.expectedBankPaise).toBe(0n)
    expect(summary.receivedPrincipalPaise).toBe(L(710100))
  })

  it('flags received money that is not applied to an installment', () => {
    const summary = summarizeLedger({
      considerationPaise: L(2130300),
      gstPercent: 5,
      installments: rows,
      receipts: [receipt('advance', 1420200, 71010, { source: 'booking_advance' })],
      expected: [],
    })
    expect(summary.unallocatedPrincipalPaise).toBe(L(1420200))
    expect(summary.unallocatedGstPaise).toBe(L(71010))
    expect(summary.warnings[0]).toContain('not applied')
  })

  it('picks the first due installment as the next payment due', () => {
    const summary = summarizeLedger({
      considerationPaise: L(2130300),
      gstPercent: 5,
      installments: [installment('booking', 1, 1420200, 1420200, 71010), installment('basement', 2, 710100, 0, 0, { due: true })],
      receipts: [],
      expected: [],
    })
    expect(summary.nextDue?.id).toBe('basement')
    expect(summary.nextDue?.outstandingPaise).toBe(L(710100 + 35505))
  })
})

describe('allocating received money', () => {
  it('applies a booking receipt to the booking installment first, principal and GST separately', () => {
    const plan = planAllocations(
      [installment('basement', 2, 710100), installment('booking', 1, 1420200)],
      [receipt('advance', 1420200, 71010)]
    )
    expect(plan).toEqual([{ receiptId: 'advance', scheduleRowId: 'booking', principalPaise: L(1420200), gstPaise: L(71010) }])
  })

  it('spills an overpayment into the next installment and never past what is outstanding', () => {
    const plan = planAllocations(
      [installment('booking', 1, 1000), installment('next', 2, 500)],
      [receipt('big', 1200, 60)]
    )
    expect(plan).toEqual([
      { receiptId: 'big', scheduleRowId: 'booking', principalPaise: L(1000), gstPaise: L(50) },
      { receiptId: 'big', scheduleRowId: 'next', principalPaise: L(200), gstPaise: L(10) },
    ])
  })

  it('does not apply cheques awaiting clearance or money already applied', () => {
    const plan = planAllocations(
      [installment('booking', 1, 1000, 400, 20)],
      [
        receipt('pending', 600, 30, { clearance: 'pending_clearance' }),
        receipt('done', 400, 20, { allocatedPrincipalPaise: L(400), allocatedGstPaise: L(20) }),
      ]
    )
    expect(plan).toEqual([])
  })

  it('applies the same receipt only once when run again', () => {
    const rows = [installment('booking', 1, 1000)]
    const first = planAllocations(rows, [receipt('r', 1000, 50)])
    const again = planAllocations(
      [installment('booking', 1, 1000, 1000, 50)],
      [receipt('r', 1000, 50, { allocatedPrincipalPaise: L(1000), allocatedGstPaise: L(50) })]
    )
    expect(first).toHaveLength(1)
    expect(again).toEqual([])
  })

  it('splits one payment across chosen installments with a leftover credit', () => {
    const result = splitAcrossInstallments(
      { principal: L(1500), gst: L(60) },
      [
        { id: 'a', outstandingPrincipalPaise: L(1000), outstandingGstPaise: L(50) },
        { id: 'b', outstandingPrincipalPaise: L(300), outstandingGstPaise: L(15) },
      ]
    )
    expect(result.allocations).toEqual([
      { scheduleRowId: 'a', principalPaise: L(1000), gstPaise: L(50) },
      { scheduleRowId: 'b', principalPaise: L(300), gstPaise: L(10) },
    ])
    expect(result.leftover).toEqual({ principal: L(200), gst: 0n })
  })
})
