'use server'

import { requireRole } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function deleteBooking(bookingId: string) {
  try {
    const profile = await requireRole(['ADMIN', 'EXECUTIVE'])
    const supabase = await createClient()

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
    console.error('Delete booking error:', error.message)
    throw error
  }
}

export async function restoreBooking(bookingId: string) {
  try {
    const profile = await requireRole(['ADMIN'])
    const supabase = await createClient()

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
    console.error('Restore booking error:', error.message)
    throw error
  }
}
