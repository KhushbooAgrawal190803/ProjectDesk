import { describe, expect, it } from 'vitest'
import { buildStatements, UNAPPLIED_SLAB } from './statement'
import type { BookingLedger } from './load'
import type { LedgerAllocation, LedgerReceipt } from './model'

const L = (rupees: number) => BigInt(Math.round(rupees * 100))

function receipt(id: string, date: string, principal: number, gst: number, extra: Partial<LedgerReceipt> = {}): LedgerReceipt {
  return {
    id, source: 'manual', principalPaise: L(principal), gstPaise: L(gst), date, mode: 'Cheque', reference: `CHQ-${id}`, remarks: null,
    payerKind: 'applicant', payerName: null, bankName: 'SBI', clearance: 'cleared', notes: null, expectedEntryId: null,
    paymentEntryId: null, createdAt: `${date}T10:00:00Z`, allocatedPrincipalPaise: 0n, allocatedGstPaise: 0n, ...extra,
  }
}

function ledger(unit: string, receipts: LedgerReceipt[], allocations: LedgerAllocation[], entries: Array<Record<string, unknown>> = []): BookingLedger {
  return {
    booking: { id: unit, unit_no: unit, applicant_salutation: 'Mr.', applicant_name: `Buyer ${unit}`, serial_display: `LUBC ${unit}` },
    state: {
      today: '2026-11-26', finalized: true, blockers: [], advancePrincipalPaise: 0n, advanceGstPaise: 0n,
      unallocatedPrincipalPaise: 0n, unallocatedGstPaise: 0n, advanceReceiptId: null,
      installments: [
        { id: `${unit}-1`, sort: 1, label: 'At the time of booking' },
        { id: `${unit}-2`, sort: 2, label: 'Before casting of Basement slab' },
      ] as BookingLedger['state']['installments'],
    },
    receipts, allocations, expected: [], entries, summary: {} as BookingLedger['summary'], gstPercent: 5, migrationApplied: true,
  }
}

const alloc = (id: string, receiptId: string, row: string, principal: number, gst: number): LedgerAllocation =>
  ({ id, receiptId, scheduleRowId: row, principalPaise: L(principal), gstPaise: L(gst), createdAt: null })

describe('cash statement', () => {
  const developer = ledger('501', [
    receipt('r2', '2026-11-20', 300000, 15000),
    receipt('r1', '2026-11-05', 100000, 5000),
    receipt('pending', '2026-11-10', 50000, 0, { clearance: 'pending_clearance' }),
    receipt('returned', '2026-11-11', 50000, 0, { clearance: 'returned' }),
    receipt('old', '2026-03-01', 70000, 0),
  ], [
    alloc('a1', 'r1', '501-1', 100000, 5000),
    alloc('a2', 'r2', '501-1', 200000, 10000),
    alloc('a3', 'r2', '501-2', 50000, 2500),
  ])
  const balaji = ledger('806', [receipt('b1', '2026-11-12', 1000000, 50000)], [alloc('b1a', 'b1', '806-1', 1000000, 50000)])
  const statements = buildStatements([developer, balaji], { from: '2026-04-01', to: '2026-11-30' })
  const rows = statements.DEVELOPER.rows

  it('includes only cleared money inside the dates, in date order', () => {
    expect([...new Set(rows.map((row) => row.receiptId))]).toEqual(['r1', 'r2'])
    expect(statements.DEVELOPER.payments).toBe(2)
  })
  it('splits each payment by slab, principal then GST, and shows what is not applied yet', () => {
    expect(rows.map((row) => [row.receiptId, row.slab, row.kind, row.amountPaise])).toEqual([
      ['r1', 'At the time of booking', 'principal', L(100000)],
      ['r1', 'At the time of booking', 'gst', L(5000)],
      ['r2', 'At the time of booking', 'principal', L(200000)],
      ['r2', 'At the time of booking', 'gst', L(10000)],
      ['r2', 'Before casting of Basement slab', 'principal', L(50000)],
      ['r2', 'Before casting of Basement slab', 'gst', L(2500)],
      ['r2', UNAPPLIED_SLAB, 'principal', L(50000)],
      ['r2', UNAPPLIED_SLAB, 'gst', L(2500)],
    ])
  })
  it('totals principal and GST separately and they add up to what was received', () => {
    expect(statements.DEVELOPER.principalPaise).toBe(L(400000))
    expect(statements.DEVELOPER.gstPaise).toBe(L(20000))
    expect(statements.DEVELOPER.totalPaise).toBe(L(420000))
  })
  it('carries the party, mode, number and flat on every row', () => {
    expect(rows[0]).toMatchObject({ party: 'Mr. Buyer 501', mode: 'Cheque', reference: 'CHQ-r1', bank: 'SBI', flat: '501', date: '2026-11-05' })
  })
  it('puts landowner flats on the Balaji statement', () => {
    expect(statements.LANDOWNER.rows.map((row) => [row.flat, row.kind, row.amountPaise])).toEqual([['806', 'principal', L(1000000)], ['806', 'gst', L(50000)]])
    expect(statements.DEVELOPER.rows.some((row) => row.flat === '806')).toBe(false)
  })
  it('carries the booking so a row can open its financials', () => {
    expect(rows.every((row) => row.bookingId === '501')).toBe(true)
  })
})

describe('booking-form payments on the statement', () => {
  // Like flat 506: several cheques and a transfer on the booking form, stored as one combined receipt
  // with the first cheque's date and number.
  const entries = [
    { id: 'e1', payment_date: '2026-07-30', amount: '500000', gst_amount: '0', payment_mode: 'Cheque', reference_no: '691313', originating_bank: 'Canara', status: 'received' },
    { id: 'e2', payment_date: '2026-07-30', amount: '0', gst_amount: '25000', payment_mode: 'Cheque', reference_no: '691315', status: 'received' },
    { id: 'e3', payment_date: '2026-08-05', amount: '1322400', gst_amount: '66120', payment_mode: 'NEFT_RTGS', reference_no: 'CNRBRS2026', status: 'received' },
    { id: 'e4', payment_date: null, amount: '977920', gst_amount: '0', payment_mode: 'NEFT_RTGS', status: 'expected' },
  ]
  const combined = receipt('adv', '2026-07-30', 1822400, 91120, { source: 'booking_advance', reference: '691313' })
  const book = ledger('501', [combined], [
    alloc('x1', 'adv', '501-1', 1000000, 50000),
    alloc('x2', 'adv', '501-2', 822400, 41120),
  ], entries)

  it('lists each cheque and transfer with its own date and number, leaving out expected bank money', () => {
    const rows = buildStatements([book], { from: '2026-04-01', to: '2026-12-31' }).DEVELOPER.rows
    expect(rows.map((row) => [row.date, row.mode, row.reference, row.slab, row.kind, row.amountPaise])).toEqual([
      ['2026-07-30', 'Cheque', '691313', 'At the time of booking', 'principal', L(500000)],
      ['2026-07-30', 'Cheque', '691315', 'At the time of booking', 'gst', L(25000)],
      ['2026-08-05', 'NEFT / RTGS', 'CNRBRS2026', 'At the time of booking', 'principal', L(500000)],
      ['2026-08-05', 'NEFT / RTGS', 'CNRBRS2026', 'At the time of booking', 'gst', L(25000)],
      ['2026-08-05', 'NEFT / RTGS', 'CNRBRS2026', 'Before casting of Basement slab', 'principal', L(822400)],
      ['2026-08-05', 'NEFT / RTGS', 'CNRBRS2026', 'Before casting of Basement slab', 'gst', L(41120)],
    ])
    expect(rows[0].bank).toBe('Canara')
  })
  it('applies the date range to each payment, not to the combined receipt', () => {
    const august = buildStatements([book], { from: '2026-08-01', to: '2026-08-31' }).DEVELOPER
    expect(august.rows.every((row) => row.date === '2026-08-05')).toBe(true)
    expect(august.totalPaise).toBe(L(1322400 + 66120))
    expect(august.payments).toBe(1)
  })
  it('falls back to the receipt as recorded when the form no longer adds up to it', () => {
    const edited = ledger('501', [{ ...combined, principalPaise: L(1800000) }], [], entries)
    const rows = buildStatements([edited], { from: '2026-04-01', to: '2026-12-31' }).DEVELOPER.rows
    expect(new Set(rows.map((row) => row.reference))).toEqual(new Set(['691313']))
  })
})
