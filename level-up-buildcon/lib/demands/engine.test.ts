import { describe, expect, it } from 'vitest'
import { CONSTRUCTION_MILESTONES, matchMilestoneCode } from './milestones'
import {
  addCalendarDays,
  collectionStatus,
  displayStatus,
  formatDemandNumber,
  installmentGstPaise,
  isInstallmentDue,
  isOverdue,
  paymentFitsOutstanding,
  planDemandIssues,
  subtractSplit,
  todayInTimeZone,
  type InstallmentCandidate,
} from './engine'

function row(partial: Partial<InstallmentCandidate> & Pick<InstallmentCandidate, 'id'>): InstallmentCandidate {
  return {
    trigger: 'milestone',
    linked: true,
    milestoneCompleted: false,
    dueDate: null,
    principalPaise: 100000000n,
    gstPaise: 5000000n,
    allocatedPrincipalPaise: 0n,
    allocatedGstPaise: 0n,
    hasDemand: false,
    ...partial,
  }
}

describe('demand dates', () => {
  it('uses the Asia/Kolkata calendar date, including midnight', () => {
    expect(todayInTimeZone(new Date('2026-12-02T18:29:00Z'), 'Asia/Kolkata')).toBe('2026-12-02')
    expect(todayInTimeZone(new Date('2026-12-02T18:30:00Z'), 'Asia/Kolkata')).toBe('2026-12-03')
  })

  it('adds seven calendar days for the payment deadline', () => {
    expect(addCalendarDays('2026-11-09', 7)).toBe('2026-11-16')
  })

  it('a dated installment is not due the day before, is due on the day, and stays due if a run was missed', () => {
    const dated = { trigger: 'date' as const, milestoneCompleted: false, dueDate: '2026-12-03' }
    expect(isInstallmentDue({ ...dated, today: '2026-12-02' })).toBe(false)
    expect(isInstallmentDue({ ...dated, today: '2026-12-03' })).toBe(true)
    expect(isInstallmentDue({ ...dated, today: '2026-12-05' })).toBe(true)
  })
})

describe('milestone dues', () => {
  it('does not demand a milestone until the project marks it complete, and does not repeat a demand', () => {
    const first = row({ id: 'floor-1', milestoneCompleted: false })
    const later = row({ id: 'floor-1', milestoneCompleted: true })
    const again = row({ id: 'floor-1', milestoneCompleted: true, hasDemand: true })
    expect(planDemandIssues([first], '2026-11-10').issue).toEqual([])
    expect(planDemandIssues([later], '2026-11-10').issue.map((item) => item.id)).toEqual(['floor-1'])
    expect(planDemandIssues([again], '2026-11-10').skipped[0].reason).toBe('already_issued')
  })

  it('marks only the completed milestones due when a flat is booked afterwards', () => {
    const rows = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'].map((id, index) =>
      row({ id, milestoneCompleted: index < 4, principalPaise: 75000000n, gstPaise: 3750000n })
    )
    const plan = planDemandIssues(rows, '2026-11-10')
    expect(plan.issue.map((item) => item.id)).toEqual(['m1', 'm2', 'm3', 'm4'])
    expect(plan.skipped.map((item) => item.reason)).toEqual(['not_due', 'not_due'])
  })

  it('keeps each booking on its own percentage for the same milestone', () => {
    const ten = row({ id: 'a', milestoneCompleted: true, principalPaise: 50000000n, gstPaise: installmentGstPaise(50000000n) })
    const twenty = row({ id: 'b', milestoneCompleted: true, principalPaise: 100000000n, gstPaise: installmentGstPaise(100000000n) })
    const plan = planDemandIssues([ten, twenty], '2026-11-10')
    expect(plan.issue[0].outstanding.principal).toBe(50000000n)
    expect(plan.issue[1].outstanding.principal).toBe(100000000n)
  })

  it('does not treat an unallocated booking advance as a payment of the installment', () => {
    const open = row({ id: 'basement', milestoneCompleted: true, allocatedPrincipalPaise: 0n, allocatedGstPaise: 0n })
    expect(planDemandIssues([open], '2026-11-10').issue[0].outstanding.principal).toBe(100000000n)
  })

  it('reduces the demand by money already allocated, and skips a fully settled installment', () => {
    const partial = row({
      id: 'partial',
      milestoneCompleted: true,
      principalPaise: 100000000n,
      gstPaise: 5000000n,
      allocatedPrincipalPaise: 30000000n,
      allocatedGstPaise: 1500000n,
    })
    const settled = row({
      id: 'settled',
      milestoneCompleted: true,
      allocatedPrincipalPaise: 100000000n,
      allocatedGstPaise: 5000000n,
    })
    const plan = planDemandIssues([partial, settled], '2026-11-10')
    expect(plan.issue).toEqual([{ id: 'partial', outstanding: { principal: 70000000n, gst: 3500000n } }])
    expect(plan.skipped[0]).toEqual({ id: 'settled', reason: 'settled' })
  })

  it('does not trigger a milestone row that is not linked to a stable milestone', () => {
    expect(planDemandIssues([row({ id: 'loose', linked: false, milestoneCompleted: true })], '2026-11-10').skipped[0].reason).toBe('not_linked')
  })
})

describe('collections', () => {
  it('charges 5 percent GST on the installment, not on a second copy of the same money', () => {
    expect(installmentGstPaise(100000000n)).toBe(5000000n)
    expect(installmentGstPaise(132240000n)).toBe(6612000n)
  })

  it('accepts partial principal and GST, then rejects a payment past the outstanding balance', () => {
    const outstanding = subtractSplit(
      { principal: 100000000n, gst: 5000000n },
      { principal: 30000000n, gst: 1500000n }
    )
    expect(outstanding).toEqual({ principal: 70000000n, gst: 3500000n })
    expect(paymentFitsOutstanding(outstanding, { principal: 20000000n, gst: 1000000n })).toBeNull()
    expect(paymentFitsOutstanding(outstanding, { principal: 70000001n, gst: 0n })).toMatch(/Principal/)
    expect(paymentFitsOutstanding(outstanding, { principal: 0n, gst: 3500001n })).toMatch(/GST/)
  })

  it('shows Paid, Partially Paid, Due, Not Due, and Overdue from the balance and the deadline', () => {
    const outstanding = { principal: 50000000n, gst: 2500000n }
    const received = { principal: 20000000n, gst: 1000000n }
    expect(collectionStatus({ due: false, demanded: false, outstanding, received: { principal: 0n, gst: 0n } })).toBe('not_due')
    expect(displayStatus('not_due', false)).toBe('Not Due')
    expect(collectionStatus({ due: true, demanded: true, outstanding, received: { principal: 0n, gst: 0n } })).toBe('unpaid')
    expect(collectionStatus({ due: true, demanded: true, outstanding, received })).toBe('partial')
    expect(collectionStatus({
      due: true,
      demanded: true,
      outstanding: { principal: 0n, gst: 0n },
      received: { principal: 100000000n, gst: 5000000n },
    })).toBe('paid')
    expect(isOverdue({ demanded: true, outstanding, deadline: '2026-11-16', today: '2026-11-17' })).toBe(true)
    expect(isOverdue({ demanded: true, outstanding, deadline: '2026-11-16', today: '2026-11-16' })).toBe(false)
    expect(isOverdue({ demanded: true, outstanding: { principal: 0n, gst: 0n }, deadline: '2026-11-01', today: '2026-11-20' })).toBe(false)
    expect(displayStatus('unpaid', false)).toBe('Due')
    expect(displayStatus('partial', false)).toBe('Partially Paid')
    expect(displayStatus('partial', true)).toBe('Overdue')
    expect(displayStatus('paid', true)).toBe('Paid')
  })
})

describe('numbering and milestone identity', () => {
  it('builds the unit sequence used on the reference notes', () => {
    expect(formatDemandNumber('LUB/{PROJECT}/DN/{UNIT}/{SEQ}/{YEAR}', {
      project: 'Anandam',
      unit: '702',
      seq: 1,
      year: 2026,
    })).toBe('LUB/ANANDAM/DN/702/001/2026')
  })

  it('matches 1st floor and 10th floor to different codes', () => {
    expect(matchMilestoneCode('6% before casting of 1st floor slab')).toBe('FLOOR_1')
    expect(matchMilestoneCode('5% before casting of 10th floor slab')).toBe('FLOOR_10')
    expect(CONSTRUCTION_MILESTONES).toHaveLength(14)
  })
})
