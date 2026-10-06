import type { SupabaseClient } from '@supabase/supabase-js'

export const UNIT_CONFLICT_MESSAGE =
  'This unit was just booked or is no longer available. Please choose another unit.'

export const AVAILABILITY_CHECK_FAILED_MESSAGE =
  "We couldn't verify unit availability. Please try again."

/** Statuses that reserve a unit against double-booking (matches DB partial unique index). */
export const UNIT_HOLD_STATUSES = ['PENDING', 'SUBMITTED', 'EDITED'] as const

export function isUnitConflictError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return error.code === '23505' || /unique|duplicate/i.test(error.message ?? '')
}

export async function checkUnitAvailability(
  supabase: SupabaseClient,
  projectName: string,
  unitNo: string,
  excludeBookingId?: string
): Promise<{ available: true } | { available: false; message: string } | { error: string }> {
  if (!projectName?.trim() || !unitNo?.trim()) {
    return { available: true }
  }

  let query = supabase
    .from('bookings')
    .select('id, serial_display, applicant_name')
    .eq('project_name', projectName.trim())
    .eq('unit_no', unitNo.trim())
    .in('status', [...UNIT_HOLD_STATUSES])
    .is('deleted_at', null)

  if (excludeBookingId) {
    query = query.neq('id', excludeBookingId)
  }

  const { data, error } = await query

  if (error) {
    console.error('[availability] query failed:', error.message)
    return { error: AVAILABILITY_CHECK_FAILED_MESSAGE }
  }

  if (data && data.length > 0) {
    const existing = data[0]
    return {
      available: false,
      message: `Unit ${unitNo} is already booked (${existing.serial_display || 'Booking'} — ${existing.applicant_name || 'Unknown'})`,
    }
  }

  return { available: true }
}
