import type { SupabaseClient } from '@supabase/supabase-js'
import { todayInTimeZone } from '@/lib/demands/engine'
import type { OwnerType } from '@/lib/data/flat-ownership'
import { loadBookingLedgers } from './load'
import { buildStatements, type Statement } from './statement'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** 1 April of the current Indian financial year. */
function financialYearStart(today: string): string {
  const [year, month] = today.split('-').map(Number)
  return `${month >= 4 ? year : year - 1}-04-01`
}

/** The period asked for, defaulting to the financial year to date, and which company's statement. */
export function statementParams(params: { from?: string | null; to?: string | null; owner?: string | null }) {
  const today = todayInTimeZone(new Date())
  return {
    from: ISO_DATE.test(params.from || '') ? params.from! : financialYearStart(today),
    to: ISO_DATE.test(params.to || '') ? params.to! : today,
    owner: (params.owner === 'balaji' ? 'LANDOWNER' : 'DEVELOPER') as OwnerType,
  }
}

/** Both companies' statements for the period. The page and the Excel and PDF downloads all use this. */
export async function loadStatements(supabase: SupabaseClient, range: { from: string; to: string }): Promise<Record<OwnerType, Statement>> {
  // Only bookings with money received in the period are loaded.
  const { data, error } = await supabase
    .from('payment_receipts')
    .select('booking_id')
    .eq('clearance_status', 'cleared')
  if (error) throw new Error(error.message)
  // Not filtered by date here: a booking-form receipt carries its first cheque's date,
  // while the cheques inside it can fall in the period.
  const ids = [...new Set((data || []).map((row) => String(row.booking_id)))]
  const ledgers = await loadBookingLedgers(supabase, ids)
  return buildStatements(ledgers.values(), range)
}
