'use server'

import { requireStaff } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { parseBookingDraft, type BookingFormData } from '@/lib/validations/booking'
import { assertCanEditBooking } from '@/lib/auth/permissions'
import { derivePricingFields, toNum } from '@/lib/booking/calculations'
import {
  checkUnitAvailability as queryUnitAvailability,
  isUnitConflictError,
  UNIT_CONFLICT_MESSAGE,
} from '@/lib/booking/availability'

const EDITABLE_FIELDS = [
  'project_name', 'project_location', 'project_address', 'rera_regn_no', 'building_permit_no',
  'unit_category', 'unit_no', 'floor_no', 'builtup_area', 'super_builtup_area', 'carpet_area',
  'applicant_name', 'applicant_father_or_spouse', 'applicant_mobile', 'applicant_email',
  'applicant_pan', 'applicant_aadhaar', 'applicant_address',
  'coapplicant_name', 'coapplicant_relationship', 'coapplicant_mobile', 'coapplicant_pan', 'coapplicant_aadhaar',
  'rate_per_sqft', 'total_cost', 'gst_amount', 'booking_amount_paid', 'payment_mode', 'payment_mode_detail',
  'txn_or_cheque_no', 'txn_date', 'payment_plan_type', 'payment_plan_custom_text',
  'additional_parking', 'premium_parking',
] as const

export async function updateBooking(bookingId: string, data: Partial<BookingFormData>) {
  const parsed = parseBookingDraft(data)
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Invalid booking data')
  }

  const profile = await requireStaff()
  const supabase = await createClient()

  const { data: existing, error: fetchError } = await supabase
    .from('bookings')
    .select('id, status, created_by, deleted_at, project_name, unit_no')
    .eq('id', bookingId)
    .single()

  if (fetchError || !existing) throw new Error('Booking not found')
  assertCanEditBooking(profile, existing)

  const updateData: Record<string, unknown> = {}
  for (const key of EDITABLE_FIELDS) {
    const value = parsed.data[key as keyof BookingFormData]
    if (value === undefined) continue
    if (['builtup_area', 'super_builtup_area', 'carpet_area', 'rate_per_sqft', 'total_cost', 'gst_amount', 'booking_amount_paid'].includes(key)) {
      updateData[key] = toNum(value)
    } else if (value === '') {
      updateData[key] = null
    } else {
      updateData[key] = value
    }
  }

  const pricing = derivePricingFields({ ...existing, ...parsed.data })
  updateData.rate_per_sqft = pricing.rate_per_sqft
  updateData.total_cost = pricing.total_cost
  updateData.gst_amount = pricing.gst_amount

  const nextProject = (updateData.project_name as string) ?? existing.project_name
  const nextUnit = (updateData.unit_no as string) ?? existing.unit_no
  if (nextProject && nextUnit) {
    const availability = await queryUnitAvailability(supabase, nextProject, nextUnit, bookingId)
    if ('error' in availability) throw new Error(availability.error)
    if (!availability.available) throw new Error(availability.message)
  }

  if (existing.status === 'SUBMITTED') {
    updateData.status = 'EDITED'
  }

  const { error } = await supabase.from('bookings').update(updateData).eq('id', bookingId)

  if (error) {
    if (isUnitConflictError(error)) throw new Error(UNIT_CONFLICT_MESSAGE)
    throw new Error(`Failed to update booking: ${error.message}`)
  }

  await supabase.from('booking_audit_log').insert({
    booking_id: bookingId,
    changed_by: profile.id,
    action: 'EDITED',
    diff_json: updateData,
  })

  revalidatePath(`/bookings/${bookingId}`)
  revalidatePath('/bookings')

  return { success: true, bookingId }
}
