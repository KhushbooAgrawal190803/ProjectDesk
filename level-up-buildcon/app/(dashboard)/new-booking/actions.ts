'use server'

import { requireProfile } from '@/lib/auth/get-user'
import { createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { BookingFormData } from '@/lib/validations/booking'

export async function saveDraft(data: Partial<BookingFormData>, draftId?: string) {
  try {
    const profile = await requireProfile()
    const supabase = await createServiceClient()

    // Normalize and prepare booking data (never downgrade PENDING → DRAFT on update)
    const bookingData: any = {
      created_by: profile.id,
      // Persisted DB enum – for Anandam everything is treated as a flat
      unit_type: 'Flat',
    }

    // Only include fields that are provided in the partial data
    const fieldMappings: { [key: string]: boolean } = {
      project_name: true,
      project_location: true,
      project_address: true,
      rera_regn_no: true,
      building_permit_no: true,
      unit_category: true,
      unit_no: true,
      floor_no: true,
      builtup_area: true,
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
      rate_per_sqft: true,
      total_cost: true,
      gst_amount: true,
      booking_amount_paid: true,
      payment_mode: true,
      payment_mode_detail: true,
      txn_or_cheque_no: true,
      txn_date: true,
      payment_plan_type: true,
      payment_plan_custom_text: true,
      additional_parking: true,
      premium_parking: true,
    }

    // Map and normalize fields (avoid sending NaN for numeric fields)
    const numKeys = ['builtup_area', 'super_builtup_area', 'carpet_area', 'rate_per_sqft', 'total_cost', 'gst_amount', 'booking_amount_paid', 'additional_parking', 'premium_parking']
    for (const [key, value] of Object.entries(data)) {
      if (fieldMappings[key]) {
        if (numKeys.includes(key)) {
          const n = value != null && value !== '' ? Number(value) : null
          bookingData[key] = Number.isFinite(n) ? n : null
        } else if (value === '' || value === undefined) {
          bookingData[key] = null
        } else {
          bookingData[key] = value
        }
      }
    }

    if (draftId) {
      const { data: updated, error } = await supabase
        .from('bookings')
        .update(bookingData)
        .eq('id', draftId)
        .eq('created_by', profile.id)
        .in('status', ['DRAFT', 'PENDING'])
        .select()
        .single()

      if (error) {
        throw new Error(`Failed to update draft: ${error.message}`)
      }

      return { success: true, draftId: updated.id }
    } else {
      // Creating a new draft
      bookingData.status = 'DRAFT'
      const { data: created, error } = await supabase
        .from('bookings')
        .insert([bookingData])
        .select()
        .single()

      if (error) {
        throw new Error(`Failed to save draft: ${error.message}`)
      }

      return { success: true, draftId: created.id }
    }
  } catch (error: any) {
    throw error
  }
}

export async function getDraft(draftId: string) {
  const profile = await requireProfile()
  const supabase = await createServiceClient()

  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', draftId)
    .eq('created_by', profile.id)
    .in('status', ['DRAFT', 'PENDING'])
    .single()

  if (error) {
    throw new Error('Draft not found')
  }

  return data
}

export async function getUserDrafts() {
  const profile = await requireProfile()
  const supabase = await createServiceClient()

  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('created_by', profile.id)
    .in('status', ['DRAFT', 'PENDING'])
    .order('updated_at', { ascending: false })

  if (error) {
    return []
  }

  return data
}

export async function checkUnitAvailability(
  projectName: string,
  unitNo: string,
  excludeBookingId?: string
): Promise<{ available: boolean; message?: string }> {
  try {
    const profile = await requireProfile()
    const supabase = await createServiceClient()

    let query = supabase
      .from('bookings')
      .select('id, serial_display, applicant_name')
      .eq('project_name', projectName)
      .eq('unit_no', unitNo)
      .neq('status', 'DRAFT')
      .is('deleted_at', null)

    if (excludeBookingId) {
      query = query.neq('id', excludeBookingId)
    }

    const { data, error } = await query

    if (error) {
      console.error('Unit check error:', error.message)
      return { available: true } // fail open
    }

    if (data && data.length > 0) {
      const existing = data[0] as any
      return {
        available: false,
        message: `Unit ${unitNo} is already booked (${existing.serial_display || 'Booking'} - ${existing.applicant_name || 'Unknown'})`,
      }
    }

    return { available: true }
  } catch {
    return { available: true } // fail open
  }
}

// Coerce to number or null; never send NaN to the DB
function toNum(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export async function submitBooking(data: BookingFormData, draftId?: string) {
  try {
    const profile = await requireProfile()
    const supabase = await createServiceClient()

    // Remove UI-only fields
    const { has_coapplicant, ...baseData } = data as any

    // Check unit availability before submitting (only if project_name and unit_no are provided)
    if (baseData.project_name && baseData.unit_no) {
      const unitCheck = await checkUnitAvailability(
        baseData.project_name,
        baseData.unit_no,
        draftId // exclude current draft from check
      )
      if (!unitCheck.available) {
        throw new Error(unitCheck.message || 'This unit is already booked')
      }
    }

    // Normalize and prepare booking data (use toNum so we never send NaN)
    const bookingData = {
      // Project & Unit
      project_name: baseData.project_name || null,
      project_location: baseData.project_location || 'Ranchi, Jharkhand',
      project_address: baseData.project_address || null,
      rera_regn_no: baseData.rera_regn_no || null,
      building_permit_no: baseData.building_permit_no || null,
      unit_category: baseData.unit_category || null,
      // Persisted DB enum – for Anandam everything is treated as a flat
      unit_type: 'Flat' as const,
      unit_type_other_text: null,
      unit_no: baseData.unit_no || null,
      floor_no: baseData.floor_no || null,
      builtup_area: toNum(baseData.builtup_area),
      super_builtup_area: toNum(baseData.super_builtup_area),
      carpet_area: toNum(baseData.carpet_area),
      
      // Applicant
      applicant_name: baseData.applicant_name || null,
      applicant_father_or_spouse: baseData.applicant_father_or_spouse || null,
      applicant_mobile: baseData.applicant_mobile || null,
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
      rate_per_sqft: toNum(baseData.rate_per_sqft),
      total_cost: toNum(baseData.total_cost),
      gst_amount: toNum(baseData.gst_amount),
      booking_amount_paid: toNum(baseData.booking_amount_paid),
      payment_mode: baseData.payment_mode || null,
      payment_mode_detail: baseData.payment_mode_detail || null,
      txn_or_cheque_no: baseData.txn_or_cheque_no || null,
      txn_date: baseData.txn_date || null,
      
      // Payment Plan
      payment_plan_type: baseData.payment_plan_type || null,
      payment_plan_custom_text: baseData.payment_plan_custom_text || null,

      additional_parking: Math.min(5, Math.max(0, Number(baseData.additional_parking) || 0)),
      premium_parking: Math.min(3, Math.max(0, Number((baseData as any).premium_parking) || 0)),

      // System fields
      status: profile.role === 'ADMIN' ? 'SUBMITTED' : 'PENDING',
      created_by: profile.id,
      submitted_at: new Date().toISOString(),
    }

    let bookingId: string

    if (draftId) {
      const { data: updated, error } = await supabase
        .from('bookings')
        .update(bookingData)
        .eq('id', draftId)
        .eq('created_by', profile.id)
        .select()
        .maybeSingle()

      if (error) {
        throw new Error(`Failed to submit booking: ${error.message}`)
      }

      if (updated) {
        bookingId = updated.id
      } else {
        // Draft no longer exists, fall back to insert
        const { data: created, error: insertError } = await supabase
          .from('bookings')
          .insert([bookingData])
          .select()
          .single()

        if (insertError) {
          throw new Error(`Failed to submit booking: ${insertError.message}`)
        }

        bookingId = created.id
      }
    } else {
      const { data: created, error } = await supabase
        .from('bookings')
        .insert([bookingData])
        .select()
        .single()

      if (error) {
        throw new Error(`Failed to submit booking: ${error.message}`)
      }

      bookingId = created.id
    }

    // Create audit log entry
    await supabase
      .from('booking_audit_log')
      .insert({
        booking_id: bookingId,
        changed_by: profile.id,
        action: draftId ? 'EDITED' : 'CREATED',
      })

    revalidatePath('/bookings')
    revalidatePath('/dashboard')
    
    return { success: true, bookingId }
  } catch (error: any) {
    throw error
  }
}

export async function deleteDraft(draftId: string) {
  const profile = await requireProfile()
  const supabase = await createServiceClient()

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

