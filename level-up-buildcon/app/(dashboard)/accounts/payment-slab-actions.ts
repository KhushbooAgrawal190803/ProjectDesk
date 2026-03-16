'use server'

import { requireRole } from '@/lib/auth/get-user'
import { createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function getPaymentSlabs() {
  const supabase = await createServiceClient()
  const { data, error } = await supabase
    .from('payment_slabs')
    .select('*')
    .order('sr_no', { ascending: true })
  if (error) return []
  return data || []
}

export async function getBookingsForSlab(slabId: number) {
  await requireRole(['ACCOUNTS', 'ADMIN'])
  const supabase = await createServiceClient()

  const { data: slab } = await supabase
    .from('payment_slabs')
    .select('id, label, percentage')
    .eq('id', slabId)
    .single()

  if (!slab) return { slab: null, bookings: [], payments: [] }

  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, serial_display, applicant_name, unit_no, project_name, total_cost')
    .in('status', ['SUBMITTED', 'EDITED'])
    .order('serial_no', { ascending: true })

  const { data: payments } = await supabase
    .from('booking_payment_slabs')
    .select('booking_id, amount_due, amount_received, received_at, notes')
    .eq('slab_id', slabId)

  const paymentByBooking = new Map(
    (payments || []).map((p: any) => [p.booking_id, p])
  )

  const rows = (bookings || []).map((b: any) => {
    const totalCost = Number(b.total_cost) || 0
    const amountDue = (totalCost * Number(slab.percentage)) / 100
    const rec = paymentByBooking.get(b.id)
    return {
      ...b,
      amount_due: amountDue,
      amount_received: rec ? Number(rec.amount_received) : 0,
      received_at: rec?.received_at || null,
      notes: rec?.notes || null,
      payment_row_id: rec ? (rec as any).id : null,
    }
  })

  return {
    slab: { id: slab.id, label: slab.label || `Slab ${slabId}`, percentage: slab.percentage },
    bookings: rows,
  }
}

export async function setSlabPayment(
  bookingId: string,
  slabId: number,
  amountReceived: number,
  receivedAt?: string,
  notes?: string
) {
  const profile = await requireRole(['ACCOUNTS', 'ADMIN'])
  const supabase = await createServiceClient()

  const { data: booking } = await supabase
    .from('bookings')
    .select('total_cost')
    .eq('id', bookingId)
    .single()

  const { data: slabRow } = await supabase
    .from('payment_slabs')
    .select('percentage')
    .eq('id', slabId)
    .single()

  if (!booking || !slabRow) throw new Error('Booking or slab not found')
  const totalCost = Number(booking.total_cost) || 0
  const amountDue = (totalCost * Number(slabRow.percentage)) / 100

  const row = {
    booking_id: bookingId,
    slab_id: slabId,
    amount_due: amountDue,
    amount_received: amountReceived,
    received_at: receivedAt || null,
    entered_by: profile.id,
    notes: notes || null,
    updated_at: new Date().toISOString(),
  }

  const { data: existing } = await supabase
    .from('booking_payment_slabs')
    .select('id')
    .eq('booking_id', bookingId)
    .eq('slab_id', slabId)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('booking_payment_slabs')
      .update({
        amount_received: amountReceived,
        received_at: receivedAt || null,
        notes: notes || null,
        entered_by: profile.id,
        updated_at: row.updated_at,
      })
      .eq('id', existing.id)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase
      .from('booking_payment_slabs')
      .insert({
        booking_id: bookingId,
        slab_id: slabId,
        amount_due: amountDue,
        amount_received: amountReceived,
        received_at: receivedAt || null,
        entered_by: profile.id,
        notes: notes || null,
      })
    if (error) throw new Error(error.message)
  }

  revalidatePath('/accounts')
}
