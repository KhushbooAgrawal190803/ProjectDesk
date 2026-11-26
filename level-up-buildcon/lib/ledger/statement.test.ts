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

function ledger(unit: string, receipts: LedgerReceipt[], allocations: LedgerAllocation[]): BookingLedger {
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
    receipts, allocations, expected: [], entries: [], summary: {} as BookingLedger['summary'], gstPercent: 5, migrationApplied: true,
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
})
