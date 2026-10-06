'use server'

import { requireAdmin } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function deleteBooking(bookingId: string) {
  const profile = await requireAdmin()
  const supabase = await createClient()

  const { data: booking, error: getError } = await supabase
    .from('bookings')
    .select('id, serial_no, serial_display')
    .eq('id', bookingId)
    .single()

  if (getError || !booking) {
    throw new Error('Booking not found')
  }

  const { error } = await supabase
    .from('bookings')
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: profile.id,
      serial_no: null,
      serial_display: null,
    })
    .eq('id', bookingId)

  if (error) throw new Error(`Failed to delete booking: ${error.message}`)

  await supabase.from('booking_audit_log').insert({
    booking_id: bookingId,
    changed_by: profile.id,
    action: 'DELETED',
  })

  revalidatePath('/bookings')
  revalidatePath('/bookings/deleted')

  return { success: true }
}

export async function restoreBooking(bookingId: string) {
  const profile = await requireAdmin()
  const supabase = await createClient()

  const { error } = await supabase
    .from('bookings')
    .update({ deleted_at: null, deleted_by: null })
    .eq('id', bookingId)

  if (error) throw new Error(`Failed to restore booking: ${error.message}`)

  await supabase.from('booking_audit_log').insert({
    booking_id: bookingId,
    changed_by: profile.id,
    action: 'RESTORED',
  })

  revalidatePath('/bookings')
  revalidatePath('/bookings/deleted')

  return { success: true }
}

export async function revertToDraft(bookingId: string, reason?: string) {
  const profile = await requireAdmin()
  const supabase = await createClient()

  const { data: booking, error: getError } = await supabase
    .from('bookings')
    .select('id, status, serial_display')
    .eq('id', bookingId)
    .is('deleted_at', null)
    .single()

  if (getError || !booking) throw new Error('Booking not found')
  if (booking.status === 'DRAFT') throw new Error('Booking is already a draft')

  const { error } = await supabase
    .from('bookings')
    .update({ status: 'DRAFT', submitted_at: null })
    .eq('id', bookingId)

  if (error) throw new Error(`Failed to revert booking: ${error.message}`)

  await supabase.from('booking_audit_log').insert({
    booking_id: bookingId,
    changed_by: profile.id,
    action: 'REVERTED_TO_DRAFT',
    reason: reason || `Booking ${booking.serial_display || ''} sent back to drafts`,
  })

  revalidatePath('/bookings')
  revalidatePath('/new-booking')
  revalidatePath(`/bookings/${bookingId}`)

  return { success: true }
}

export async function approveBooking(bookingId: string) {
  const profile = await requireAdmin()
  const supabase = await createClient()

  const { data: booking, error: getError } = await supabase
    .from('bookings')
    .select('id, status, serial_display')
    .eq('id', bookingId)
    .is('deleted_at', null)
    .single()

  if (getError || !booking) throw new Error('Booking not found')
  if (booking.status !== 'PENDING') throw new Error('Only pending bookings can be approved')

  const { error } = await supabase
    .from('bookings')
    .update({ status: 'SUBMITTED' })
    .eq('id', bookingId)

  if (error) throw new Error(`Failed to approve booking: ${error.message}`)

  await supabase.from('booking_audit_log').insert({
    booking_id: bookingId,
    changed_by: profile.id,
    action: 'APPROVED',
    reason: `Booking ${booking.serial_display || ''} approved by admin`,
  })

  revalidatePath('/bookings')
  revalidatePath(`/bookings/${bookingId}`)

  return { success: true }
}

export async function rejectBooking(bookingId: string, reason?: string) {
  const profile = await requireAdmin()
  const supabase = await createClient()

  const { data: booking, error: getError } = await supabase
    .from('bookings')
    .select('id, status, serial_display')
    .eq('id', bookingId)
    .is('deleted_at', null)
    .single()

  if (getError || !booking) throw new Error('Booking not found')
  if (booking.status !== 'PENDING') throw new Error('Only pending bookings can be rejected')

  const { error } = await supabase
    .from('bookings')
    .update({ status: 'DRAFT', submitted_at: null })
    .eq('id', bookingId)

  if (error) throw new Error(`Failed to reject booking: ${error.message}`)

  await supabase.from('booking_audit_log').insert({
    booking_id: bookingId,
    changed_by: profile.id,
    action: 'REJECTED',
    reason: reason || `Booking ${booking.serial_display || ''} rejected by admin`,
  })

  revalidatePath('/bookings')
  revalidatePath(`/bookings/${bookingId}`)

  return { success: true }
}
