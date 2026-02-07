'use server'

import { requireProfile } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { BookingFormData } from '@/lib/validations/booking'

export async function saveDraft(data: Partial<BookingFormData>, draftId?: string) {
  try {
    const profile = await requireProfile()
    const supabase = await createClient()

    // Normalize and prepare booking data - same as submitBooking
    const bookingData: any = {
      status: 'DRAFT',
      created_by: profile.id,
    }

    // Only include fields that are provided in the partial data
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
          bookingData[key] = value ? parseFloat(value as any) : null
        } else if (value === '' || value === undefined) {
          // Convert empty strings and undefined to null
          bookingData[key] = null
        } else {
          bookingData[key] = value
        }
      }
    }

    console.log('Saving draft with normalized data')

    if (draftId) {
      // Update existing draft
      console.log('Updating existing draft:', draftId)
      const { data: updated, error } = await supabase
        .from('bookings')
        .update(bookingData)
        .eq('id', draftId)
        .eq('created_by', profile.id)
        .eq('status', 'DRAFT')
        .select()
        .single()

      if (error) {
        console.error('Draft update error:', error.message)
        throw new Error(`Failed to update draft: ${error.message}`)
      }

      console.log('Draft updated successfully')
      return { success: true, draftId: updated.id }
    } else {
      // Create new draft
      console.log('Creating new draft')
      const { data: created, error } = await supabase
        .from('bookings')
        .insert([bookingData])
        .select()
        .single()

      if (error) {
        console.error('Draft insert error:', error.message)
        throw new Error(`Failed to save draft: ${error.message}`)
      }

      console.log('Draft created successfully:', created.id)
      return { success: true, draftId: created.id }
    }
  } catch (error: any) {
    console.error('Save draft error:', error.message)
    throw error
  }
}

export async function getDraft(draftId: string) {
  const profile = await requireProfile()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', draftId)
    .eq('created_by', profile.id)
    .eq('status', 'DRAFT')
    .single()

  if (error) {
    throw new Error('Draft not found')
  }

  return data
}

export async function getUserDrafts() {
  const profile = await requireProfile()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('created_by', profile.id)
    .eq('status', 'DRAFT')
    .order('updated_at', { ascending: false })

  if (error) {
    return []
  }

  return data
}

export async function submitBooking(data: BookingFormData, draftId?: string) {
  try {
    const profile = await requireProfile()
    const supabase = await createClient()

    // Remove UI-only fields
    const { has_coapplicant, ...baseData } = data as any

    // Normalize and prepare booking data
    const bookingData = {
      // Project & Unit
      project_name: baseData.project_name,
      project_location: baseData.project_location || 'Ranchi, Jharkhand',
      rera_regn_no: baseData.rera_regn_no || null,
      unit_category: baseData.unit_category,
      unit_type: baseData.unit_type,
      unit_type_other_text: baseData.unit_type === 'Other' ? baseData.unit_type_other_text : null,
      unit_no: baseData.unit_no,
      floor_no: baseData.floor_no || null,
      super_builtup_area: baseData.super_builtup_area ? parseFloat(baseData.super_builtup_area) : null,
      carpet_area: baseData.carpet_area ? parseFloat(baseData.carpet_area) : null,
      
      // Applicant
      applicant_name: baseData.applicant_name,
      applicant_father_or_spouse: baseData.applicant_father_or_spouse,
      applicant_mobile: baseData.applicant_mobile,
      applicant_email: baseData.applicant_email || null,
      applicant_pan: baseData.applicant_pan || null,
      applicant_aadhaar: baseData.applicant_aadhaar || null,
      applicant_address: baseData.applicant_address || null,
      
      // Co-applicant
      coapplicant_name: baseData.coapplicant_name || null,
      coapplicant_relationship: baseData.coapplicant_relationship || null,
      coapplicant_mobile: baseData.coapplicant_mobile || null,
      coapplicant_pan: baseData.coapplicant_pan || null,
      coapplicant_aadhaar: baseData.coapplicant_aadhaar || null,
      
      // Pricing & Payment
      basic_sale_price: parseFloat(baseData.basic_sale_price),
      other_charges: parseFloat(baseData.other_charges || 0),
      total_cost: parseFloat(baseData.total_cost),
      total_cost_override_reason: baseData.total_cost_override_reason || null,
      booking_amount_paid: parseFloat(baseData.booking_amount_paid),
      payment_mode: baseData.payment_mode,
      payment_mode_detail: baseData.payment_mode_detail || null,
      txn_or_cheque_no: baseData.txn_or_cheque_no || null,
      txn_date: baseData.txn_date || null,
      
      // Payment Plan
      payment_plan_type: baseData.payment_plan_type,
      payment_plan_custom_text: baseData.payment_plan_custom_text || null,
      
      // System fields
      status: 'SUBMITTED',
      created_by: profile.id,
      submitted_at: new Date().toISOString(),
    }

    console.log('Booking data prepared:', {
      project: bookingData.project_name,
      applicant: bookingData.applicant_name,
      created_by: bookingData.created_by,
      status: bookingData.status,
    })

    let bookingId: string

    if (draftId) {
      // Update existing draft to submitted
      console.log('Updating draft:', draftId)
      const { data: updated, error } = await supabase
        .from('bookings')
        .update(bookingData)
        .eq('id', draftId)
        .eq('created_by', profile.id)
        .select()
        .single()

      if (error) {
        console.error('Update error:', error.message)
        throw new Error(`Failed to submit booking: ${error.message}`)
      }

      bookingId = updated.id
      console.log('Draft updated successfully:', bookingId)
    } else {
      // Create new submitted booking
      console.log('Creating new booking')
      
      const { data: created, error } = await supabase
        .from('bookings')
        .insert([bookingData])
        .select()
        .single()

      if (error) {
        console.error('Insert error:', error.message)
        throw new Error(`Failed to submit booking: ${error.message}`)
      }

      bookingId = created.id
      console.log('Booking created successfully:', bookingId)
    }

    // Create audit log entry
    const { error: auditError } = await supabase
      .from('booking_audit_log')
      .insert({
        booking_id: bookingId,
        changed_by: profile.id,
        action: draftId ? 'EDITED' : 'CREATED',
      })

    if (auditError) {
      console.error('Audit log error:', auditError.message)
      throw new Error(`Failed to create audit log: ${auditError.message}`)
    }

    revalidatePath('/bookings')
    revalidatePath('/dashboard')
    
    return { success: true, bookingId }
  } catch (error: any) {
    console.error('Submit booking error:', error.message)
    throw error
  }
}

export async function deleteDraft(draftId: string) {
  const profile = await requireProfile()
  const supabase = await createClient()

  const { error } = await supabase
    .from('bookings')
    .delete()
    .eq('id', draftId)
    .eq('created_by', profile.id)
    .eq('status', 'DRAFT')

  if (error) {
    throw new Error('Failed to delete draft')
  }

  revalidatePath('/new-booking')
  return { success: true }
}

