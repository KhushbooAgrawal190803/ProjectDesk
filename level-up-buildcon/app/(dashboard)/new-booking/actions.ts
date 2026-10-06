'use server'

import { requireStaff } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { parseBookingDraft, parseBookingSubmit, type BookingFormData } from '@/lib/validations/booking'
import {
  checkUnitAvailability as queryUnitAvailability,
  isUnitConflictError,
  UNIT_CONFLICT_MESSAGE,
} from '@/lib/booking/availability'
import { clampParking, derivePricingFields, toNum } from '@/lib/booking/calculations'
import { assertCanEditOwnDraft, submitStatusForRole } from '@/lib/auth/permissions'

const DRAFT_FIELDS = [
  'project_name', 'project_location', 'project_address', 'rera_regn_no', 'building_permit_no',
  'unit_category', 'unit_no', 'floor_no', 'builtup_area', 'super_builtup_area', 'carpet_area',
  'applicant_name', 'applicant_father_or_spouse', 'applicant_mobile', 'applicant_email',
  'applicant_pan', 'applicant_aadhaar', 'applicant_address',
  'coapplicant_name', 'coapplicant_relationship', 'coapplicant_mobile', 'coapplicant_pan', 'coapplicant_aadhaar',
  'rate_per_sqft', 'total_cost', 'gst_amount', 'booking_amount_paid', 'payment_mode', 'payment_mode_detail',
  'txn_or_cheque_no', 'txn_date', 'payment_plan_type', 'payment_plan_custom_text',
  'additional_parking', 'premium_parking',
] as const

const NUMERIC_FIELDS = new Set([
  'builtup_area', 'super_builtup_area', 'carpet_area', 'rate_per_sqft', 'total_cost',
  'gst_amount', 'booking_amount_paid', 'additional_parking', 'premium_parking',
])

function mapDraftFields(data: Partial<BookingFormData>): Record<string, unknown> {
  const bookingData: Record<string, unknown> = { unit_type: 'Flat' }
  for (const key of DRAFT_FIELDS) {
    const value = data[key as keyof BookingFormData]
    if (value === undefined) continue
    if (NUMERIC_FIELDS.has(key)) {
      bookingData[key] = toNum(value)
    } else if (value === '') {
      bookingData[key] = null
    } else {
      bookingData[key] = value
    }
  }
  return bookingData
}

export async function saveDraft(data: Partial<BookingFormData>, draftId?: string) {
  const parsed = parseBookingDraft(data)
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Invalid draft data')
  }

  const profile = await requireStaff()
  const supabase = await createClient()
  const bookingData = mapDraftFields(parsed.data)

  if (draftId) {
    const { data: existing } = await supabase
      .from('bookings')
      .select('id, status, created_by, deleted_at')
      .eq('id', draftId)
      .single()

    if (!existing || existing.deleted_at) {
      throw new Error('Draft not found')
    }
    assertCanEditOwnDraft(profile, existing)

    const { data: updated, error } = await supabase
      .from('bookings')
      .update(bookingData)
      .eq('id', draftId)
      .eq('created_by', profile.id)
      .in('status', ['DRAFT', 'PENDING'])
      .select()
      .single()

    if (error) throw new Error(`Failed to update draft: ${error.message}`)
    return { success: true, draftId: updated.id }
  }

  bookingData.status = 'DRAFT'
  bookingData.created_by = profile.id

  const { data: created, error } = await supabase
    .from('bookings')
    .insert([bookingData])
    .select()
    .single()

  if (error) throw new Error(`Failed to save draft: ${error.message}`)
  return { success: true, draftId: created.id }
}

export async function getDraft(draftId: string) {
  const profile = await requireStaff()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', draftId)
    .eq('created_by', profile.id)
    .in('status', ['DRAFT', 'PENDING'])
    .is('deleted_at', null)
    .single()

  if (error) throw new Error('Draft not found')
  return data
}

export async function getUserDrafts() {
  const profile = await requireStaff()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('created_by', profile.id)
    .in('status', ['DRAFT', 'PENDING'])
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })

  if (error) return []
  return data
}

export async function checkUnitAvailability(
  projectName: string,
  unitNo: string,
  excludeBookingId?: string
): Promise<{ available: boolean; message?: string }> {
  await requireStaff()
  const supabase = await createClient()
  const result = await queryUnitAvailability(supabase, projectName, unitNo, excludeBookingId)

  if ('error' in result) {
    return { available: false, message: result.error }
  }
  if (!result.available) {
    return { available: false, message: result.message }
  }
  return { available: true }
}

export async function submitBooking(data: BookingFormData, draftId?: string) {
  const parsed = parseBookingSubmit(data)
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(', '))
  }

  const profile = await requireStaff()
  const supabase = await createClient()
  const baseData = parsed.data

  if (baseData.project_name && baseData.unit_no) {
    const unitCheck = await checkUnitAvailability(
      baseData.project_name,
      baseData.unit_no,
      draftId
    )
    if (!unitCheck.available) {
      throw new Error(unitCheck.message || 'This unit is not available')
    }
  }

  const pricing = derivePricingFields(baseData)
  const parking = clampParking(baseData.additional_parking, baseData.premium_parking)

  const bookingData = {
    project_name: baseData.project_name || null,
    project_location: baseData.project_location || 'Ranchi, Jharkhand',
    project_address: baseData.project_address || null,
    rera_regn_no: baseData.rera_regn_no || null,
    building_permit_no: baseData.building_permit_no || null,
    unit_category: baseData.unit_category || null,
    unit_type: 'Flat' as const,
    unit_type_other_text: null,
    unit_no: baseData.unit_no || null,
    floor_no: baseData.floor_no || null,
    builtup_area: toNum(baseData.builtup_area),
    super_builtup_area: toNum(baseData.super_builtup_area),
    carpet_area: toNum(baseData.carpet_area),
    applicant_name: baseData.applicant_name || null,
    applicant_father_or_spouse: baseData.applicant_father_or_spouse || null,
    applicant_mobile: baseData.applicant_mobile || null,
    applicant_email: baseData.applicant_email || null,
    applicant_pan: baseData.applicant_pan || null,
    applicant_aadhaar: baseData.applicant_aadhaar || null,
    applicant_address: baseData.applicant_address || null,
    coapplicant_name: baseData.coapplicant_name || null,
    coapplicant_relationship: baseData.coapplicant_relationship || null,
    coapplicant_mobile: baseData.coapplicant_mobile || null,
    coapplicant_pan: baseData.coapplicant_pan || null,
    coapplicant_aadhaar: baseData.coapplicant_aadhaar || null,
    rate_per_sqft: pricing.rate_per_sqft,
    total_cost: pricing.total_cost,
    gst_amount: pricing.gst_amount,
    booking_amount_paid: pricing.booking_amount_paid,
    payment_mode: baseData.payment_mode || null,
    payment_mode_detail: baseData.payment_mode_detail || null,
    txn_or_cheque_no: baseData.txn_or_cheque_no || null,
    txn_date: baseData.txn_date || null,
    payment_plan_type: baseData.payment_plan_type || null,
    payment_plan_custom_text: baseData.payment_plan_custom_text || null,
    ...parking,
    status: submitStatusForRole(profile.role),
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
      .in('status', ['DRAFT', 'PENDING'])
      .select()
      .maybeSingle()

    if (error) {
      if (isUnitConflictError(error)) throw new Error(UNIT_CONFLICT_MESSAGE)
      throw new Error(`Failed to submit booking: ${error.message}`)
    }

    if (updated) {
      bookingId = updated.id
    } else {
      const { data: created, error: insertError } = await supabase
        .from('bookings')
        .insert([bookingData])
        .select()
        .single()

      if (insertError) {
        if (isUnitConflictError(insertError)) throw new Error(UNIT_CONFLICT_MESSAGE)
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
      if (isUnitConflictError(error)) throw new Error(UNIT_CONFLICT_MESSAGE)
      throw new Error(`Failed to submit booking: ${error.message}`)
    }
    bookingId = created.id
  }

  await supabase.from('booking_audit_log').insert({
    booking_id: bookingId,
    changed_by: profile.id,
    action: draftId ? 'EDITED' : 'CREATED',
  })

  revalidatePath('/bookings')
  revalidatePath('/dashboard')

  return { success: true, bookingId }
}

export async function deleteDraft(draftId: string) {
  const profile = await requireStaff()
  const supabase = await createClient()

  const { error } = await supabase
    .from('bookings')
    .delete()
    .eq('id', draftId)
    .eq('created_by', profile.id)
    .eq('status', 'DRAFT')

  if (error) throw new Error('Failed to delete draft')

  revalidatePath('/new-booking')
  return { success: true }
}
