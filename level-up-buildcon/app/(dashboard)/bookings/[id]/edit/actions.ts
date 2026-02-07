'use server'

import { requireRole } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { BookingFormData } from '@/lib/validations/booking'

export async function updateBooking(bookingId: string, data: Partial<BookingFormData>) {
  try {
    const profile = await requireRole(['ADMIN', 'EXECUTIVE'])
    const supabase = await createClient()

    // Normalize and prepare booking data
    const updateData: any = {}

    // Only include fields that are provided
    const fieldMappings: { [key: string]: boolean } = {
      project_name: true,
      project_location: true,
      rera_regn_no: true,
      unit_category: true,
      unit_type: true,
      unit_type_other_text: true,
      unit_no: true,
      floor_no: true,
      super_builtup_area: true,
      carpet_area: true,
      applicant_name: true,
      applicant_father_or_spouse: true,
      applicant_mobile: true,
      applicant_email: true,
      applicant_pan: true,
      applicant_aadhaar: true,
      applicant_address: true,
      coapplicant_name: true,
      coapplicant_relationship: true,
      coapplicant_mobile: true,
      coapplicant_pan: true,
      coapplicant_aadhaar: true,
      basic_sale_price: true,
      other_charges: true,
      total_cost: true,
      total_cost_override_reason: true,
      booking_amount_paid: true,
      payment_mode: true,
      payment_mode_detail: true,
      txn_or_cheque_no: true,
      txn_date: true,
      payment_plan_type: true,
      payment_plan_custom_text: true,
    }

    // Map and normalize fields
    for (const [key, value] of Object.entries(data)) {
      if (fieldMappings[key]) {
        // Convert numeric fields
        if (['super_builtup_area', 'carpet_area', 'basic_sale_price', 'other_charges', 'total_cost', 'booking_amount_paid'].includes(key)) {
          updateData[key] = value ? parseFloat(value as any) : null
        } else if (value === '' || value === undefined) {
          // Convert empty strings and undefined to null
          updateData[key] = null
        } else {
          updateData[key] = value
        }
      }
    }

    // Update status to EDITED if it was SUBMITTED
    const { data: booking, error: fetchError } = await supabase
      .from('bookings')
      .select('status')
      .eq('id', bookingId)
      .single()

    if (fetchError) {
      throw new Error(`Failed to fetch booking: ${fetchError.message}`)
    }

    if (booking.status === 'SUBMITTED') {
      updateData.status = 'EDITED'
    }

    console.log('Updating booking with data:', {
      bookingId,
      updatedFields: Object.keys(updateData),
      adminId: profile.id,
    })

    const { data: updated, error } = await supabase
      .from('bookings')
      .update(updateData)
      .eq('id', bookingId)
      .select()
      .single()

    if (error) {
      console.error('Update error:', error.message)
      throw new Error(`Failed to update booking: ${error.message}`)
    }

    // Log the edit action
    const { error: auditError } = await supabase
      .from('booking_audit_log')
      .insert({
        booking_id: bookingId,
        changed_by: profile.id,
        action: 'EDITED',
        diff_json: updateData,
      })

    if (auditError) {
      console.error('Audit log error:', auditError.message)
      throw new Error(`Failed to log changes: ${auditError.message}`)
    }

    revalidatePath(`/bookings/${bookingId}`)
    revalidatePath('/bookings')

    return { success: true, bookingId }
  } catch (error: any) {
    console.error('Update booking error:', error.message)
    throw error
  }
}
