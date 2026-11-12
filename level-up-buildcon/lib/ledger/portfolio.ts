import type { SupabaseClient } from '@supabase/supabase-js'
import { loadBookingLedger, type BookingLedger } from './load'

type Row = Record<string, unknown>

export interface PortfolioEntry {
  booking: Row
  ledger: BookingLedger | null
  error: string | null
  /** schedule row id -> construction milestone code, or the scheduled date for dated rows */
  rowTrigger: Map<string, { code: string | null; date: string | null }>
}

export interface PortfolioTotals {
  considerationPaise: bigint
  gstPayablePaise: bigint
  receivedPrincipalPaise: bigint
  receivedGstPaise: bigint
  pendingClearancePaise: bigint
  expectedBankPaise: bigint
  outstandingPaise: bigint
  overduePaise: bigint
  unallocatedPaise: bigint
}

/** Every active booking with its ledger, read from the same records the booking page uses. */
export async function loadPortfolio(supabase: SupabaseClient): Promise<{ entries: PortfolioEntry[]; totals: PortfolioTotals; milestones: Row[] }> {
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('id, serial_no, serial_display, applicant_name, applicant_salutation, applicant_mobile, unit_no, project_name, status, finance_scenario, finance_bank_name, submitted_at')
    .in('status', ['SUBMITTED', 'EDITED'])
    .is('deleted_at', null)
    .order('serial_no', { ascending: true })
  if (error) throw new Error(error.message)
  const ids = (bookings || []).map((row) => row.id as string)

  const [scheduleResult, milestoneResult, coapplicantResult] = await Promise.all([
    ids.length
      ? supabase.from('booking_schedule_rows').select('id, booking_id, trigger_type, milestone_id, milestone_date').in('booking_id', ids)
      : Promise.resolve({ data: [] as Row[], error: null }),
    supabase.from('construction_milestones').select('id, code, label, sort_order, completed_at').order('sort_order'),
    ids.length
      ? supabase.from('booking_coapplicants').select('id, booking_id, salutation, name').in('booking_id', ids).order('sort_order')
      : Promise.resolve({ data: [] as Row[], error: null }),
  ])
  const milestones = milestoneResult.data || []
  const codeById = new Map(milestones.map((item) => [String(item.id), String(item.code)]))

  const entries: PortfolioEntry[] = await Promise.all(
    (bookings || []).map(async (booking) => {
      const rowTrigger = new Map<string, { code: string | null; date: string | null }>()
      for (const row of scheduleResult.data || []) {
        if (row.booking_id !== booking.id) continue
        rowTrigger.set(String(row.id), {
          code: row.trigger_type === 'milestone' && row.milestone_id ? codeById.get(String(row.milestone_id)) || null : null,
          date: row.trigger_type === 'date' ? String(row.milestone_date || '').slice(0, 10) || null : null,
        })
      }
      const coapplicants = (coapplicantResult.data || []).filter((row) => row.booking_id === booking.id)
      try {
        const ledger = await loadBookingLedger(supabase, String(booking.id))
        return { booking: { ...booking, coapplicants }, ledger, error: null, rowTrigger }
      } catch (loadError) {
        return { booking: { ...booking, coapplicants }, ledger: null, error: loadError instanceof Error ? loadError.message : 'Not available', rowTrigger }
      }
    })
  )

  const totals: PortfolioTotals = {
    considerationPaise: 0n,
    gstPayablePaise: 0n,
    receivedPrincipalPaise: 0n,
    receivedGstPaise: 0n,
    pendingClearancePaise: 0n,
    expectedBankPaise: 0n,
    outstandingPaise: 0n,
    overduePaise: 0n,
    unallocatedPaise: 0n,
  }
  for (const entry of entries) {
    const summary = entry.ledger?.summary
    if (!summary) continue
    totals.considerationPaise += summary.considerationPaise
    totals.gstPayablePaise += summary.gstPayablePaise
    totals.receivedPrincipalPaise += summary.receivedPrincipalPaise
    totals.receivedGstPaise += summary.receivedGstPaise
    totals.pendingClearancePaise += summary.pendingClearancePaise
    totals.expectedBankPaise += summary.expectedBankPaise
    totals.outstandingPaise += summary.outstandingPaise
    totals.overduePaise += summary.overduePaise
    totals.unallocatedPaise += summary.unallocatedPrincipalPaise + summary.unallocatedGstPaise
  }
  return { entries, totals, milestones }
}
