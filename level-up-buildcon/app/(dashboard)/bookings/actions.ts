'use server'

import { requireRole } from '@/lib/auth/get-user'
import { createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function deleteBooking(bookingId: string) {
  try {
    const profile = await requireRole(['ADMIN', 'EXECUTIVE'])
    const supabase = await createServiceClient()

    // First verify the booking exists
    const { data: booking, error: getError } = await supabase
      .from('bookings')
      .select('id')
      .eq('id', bookingId)
      .single()

    if (getError || !booking) {
      throw new Error('Booking not found')
    }

    // Soft delete - set deleted_at and deleted_by
    const { error } = await supabase
      .from('bookings')
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: profile.id,
      })
      .eq('id', bookingId)

    if (error) {
      console.error('Delete error:', error.message)
      throw new Error(`Failed to delete booking: ${error.message}`)
    }

    // Log the deletion
    await supabase
      .from('booking_audit_log')
      .insert({
        booking_id: bookingId,
        changed_by: profile.id,
        action: 'DELETED',
      })

    revalidatePath('/bookings')
    revalidatePath('/bookings/deleted')
    
    return { success: true }
  } catch (error: any) {
    throw error
  }
}

export async function restoreBooking(bookingId: string) {
  try {
    const profile = await requireRole(['ADMIN'])
    const supabase = await createServiceClient()

    // Restore by clearing deleted_at and deleted_by
    const { error } = await supabase
      .from('bookings')
      .update({
        deleted_at: null,
        deleted_by: null,
      })
      .eq('id', bookingId)

    if (error) {
      console.error('Restore error:', error.message)
      throw new Error(`Failed to restore booking: ${error.message}`)
    }

    // Log the restoration
    await supabase
      .from('booking_audit_log')
      .insert({
        booking_id: bookingId,
        changed_by: profile.id,
        action: 'RESTORED',
      })

    revalidatePath('/bookings')
    revalidatePath('/bookings/deleted')
    
    return { success: true }
  } catch (error: any) {
    throw error
  }
}

export async function revertToDraft(bookingId: string, reason?: string) {
  try {
    const profile = await requireRole(['ADMIN', 'EXECUTIVE'])
    const supabase = await createServiceClient()

    // Verify the booking exists and is in SUBMITTED or EDITED state
    const { data: booking, error: getError } = await supabase
      .from('bookings')
      .select('id, status, serial_display')
      .eq('id', bookingId)
      .is('deleted_at', null)
      .single()

    if (getError || !booking) {
      throw new Error('Booking not found')
    }

    if (booking.status === 'DRAFT') {
      throw new Error('Booking is already a draft')
    }

    // Update status to DRAFT
    const { error } = await supabase
      .from('bookings')
      .update({
        status: 'DRAFT',
        submitted_at: null,
      })
      .eq('id', bookingId)

    if (error) {
      console.error('Revert to draft error:', error.message)
      throw new Error(`Failed to revert booking: ${error.message}`)
    }

    // Log the action
    await supabase
      .from('booking_audit_log')
      .insert({
        booking_id: bookingId,
        changed_by: profile.id,
        action: 'REVERTED_TO_DRAFT',
        reason: reason || `Booking ${booking.serial_display || ''} sent back to drafts`,
      })

    revalidatePath('/bookings')
    revalidatePath('/new-booking')
    revalidatePath(`/bookings/${bookingId}`)
    
    return { success: true }
  } catch (error: any) {
    throw error
  }
}

export async function approveBooking(bookingId: string) {
  try {
    const profile = await requireRole(['ADMIN'])
    const supabase = await createServiceClient()

    // Verify booking exists and is PENDING
    const { data: booking, error: getError } = await supabase
      .from('bookings')
      .select('id, status, serial_display')
      .eq('id', bookingId)
      .is('deleted_at', null)
      .single()

    if (getError || !booking) {
      throw new Error('Booking not found')
    }

    if (booking.status !== 'PENDING') {
      throw new Error('Only pending bookings can be approved')
    }

    // Update status to SUBMITTED (approved)
    const { error } = await supabase
      .from('bookings')
      .update({ status: 'SUBMITTED' })
      .eq('id', bookingId)

    if (error) {
      console.error('Approve error:', error.message)
      throw new Error(`Failed to approve booking: ${error.message}`)
    }

    // Log the action
    await supabase
      .from('booking_audit_log')
      .insert({
        booking_id: bookingId,
        changed_by: profile.id,
        action: 'APPROVED',
        reason: `Booking ${booking.serial_display || ''} approved by admin`,
      })

    revalidatePath('/bookings')
    revalidatePath(`/bookings/${bookingId}`)
    
    return { success: true }
  } catch (error: any) {
    throw error
  }
}

export async function rejectBooking(bookingId: string, reason?: string) {
  try {
    const profile = await requireRole(['ADMIN'])
    const supabase = await createServiceClient()

    // Verify booking exists and is PENDING
    const { data: booking, error: getError } = await supabase
      .from('bookings')
      .select('id, status, serial_display')
      .eq('id', bookingId)
      .is('deleted_at', null)
      .single()

    if (getError || !booking) {
      throw new Error('Booking not found')
    }

    if (booking.status !== 'PENDING') {
      throw new Error('Only pending bookings can be rejected')
    }

    // Update status back to DRAFT so executive can fix and resubmit
    const { error } = await supabase
      .from('bookings')
      .update({
        status: 'DRAFT',
        submitted_at: null,
      })
      .eq('id', bookingId)

    if (error) {
      console.error('Reject error:', error.message)
      throw new Error(`Failed to reject booking: ${error.message}`)
    }

    // Log the action
    await supabase
      .from('booking_audit_log')
      .insert({
        booking_id: bookingId,
        changed_by: profile.id,
        action: 'REJECTED',
        reason: reason || `Booking ${booking.serial_display || ''} rejected by admin`,
      })

    revalidatePath('/bookings')
    revalidatePath(`/bookings/${bookingId}`)
    
    return { success: true }
  } catch (error: any) {
    throw error
  }
}
