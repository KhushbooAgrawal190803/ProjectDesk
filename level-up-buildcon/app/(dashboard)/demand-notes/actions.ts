'use server'

import { revalidatePath } from 'next/cache'
import { requireStaff } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { hundredthsToString, toHundredths } from '@/lib/booking/money'
import { paymentFitsOutstanding, paiseFrom, subtractSplit } from '@/lib/demands/engine'
import { getBookingDemandState, reconcileBooking } from '@/lib/demands/issue'

const MODES = ['Cash', 'Cheque', 'NEFT_RTGS', 'UPI', 'Other']

export async function recordDemandPayment(input: {
  demandNoteId: string
  principal: string
  gst: string
  paymentDate: string
  paymentMode: string
  reference: string
  remarks: string
}) {
  const profile = await requireStaff()
  const supabase = await createClient()
  if (!MODES.includes(input.paymentMode)) throw new Error('Choose a payment mode')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.paymentDate)) throw new Error('Enter the payment date')

  const { data: note, error } = await supabase
    .from('demand_notes')
    .select('id, booking_id, schedule_row_id, installment_amount, gst_amount')
    .eq('id', input.demandNoteId)
    .single()
  if (error || !note) throw new Error('Demand note not found')

  const { data: allocations, error: allocationError } = await supabase
    .from('installment_allocations')
    .select('principal_amount, gst_amount')
    .eq('schedule_row_id', note.schedule_row_id)
  if (allocationError) throw new Error(allocationError.message)
  const received = (allocations || []).reduce(
    (sum, item) => ({
      principal: sum.principal + paiseFrom(item.principal_amount),
      gst: sum.gst + paiseFrom(item.gst_amount),
    }),
    { principal: 0n, gst: 0n }
  )
  const outstanding = subtractSplit(
    { principal: paiseFrom(note.installment_amount), gst: paiseFrom(note.gst_amount) },
    received
  )
  const principal = toHundredths(input.principal) ?? 0n
  const gst = toHundredths(input.gst) ?? 0n
  const problem = paymentFitsOutstanding(outstanding, { principal, gst })
  if (problem) throw new Error(problem)

  const { error: postError } = await supabase.rpc('create_receipt_and_allocate', {
    p_booking_id: note.booking_id,
    p_schedule_row_id: note.schedule_row_id,
    p_principal: hundredthsToString(principal),
    p_gst: hundredthsToString(gst),
    p_payment_date: input.paymentDate,
    p_payment_mode: input.paymentMode,
    p_reference: input.reference,
    p_remarks: input.remarks,
    p_user: profile.id,
  })
  if (postError) throw new Error(postError.message)

  revalidatePath(`/demand-notes/${note.id}`)
  revalidatePath('/demand-notes')
  revalidatePath(`/bookings/${note.booking_id}`)
  return { success: true }
}

export async function allocateBookingAdvance(input: {
  bookingId: string
  scheduleRowId: string
  principal: string
  gst: string
}) {
  const profile = await requireStaff()
  const supabase = await createClient()
  const state = await getBookingDemandState(supabase, input.bookingId)
  if (!state.advanceReceiptId) throw new Error('This booking has no booking receipt to allocate')
  const principal = toHundredths(input.principal) ?? 0n
  const gst = toHundredths(input.gst) ?? 0n
  const problem = paymentFitsOutstanding(
    { principal: state.unallocatedPrincipalPaise, gst: state.unallocatedGstPaise },
    { principal, gst }
  )
  if (problem) throw new Error(problem)
  const installment = state.installments.find((item) => item.id === input.scheduleRowId)
  if (!installment) throw new Error('Installment not found')
  const tooMuch = paymentFitsOutstanding(
    { principal: installment.outstandingPrincipalPaise, gst: installment.outstandingGstPaise },
    { principal, gst }
  )
  if (tooMuch) throw new Error(tooMuch)

  const { error } = await supabase.from('installment_allocations').insert({
    receipt_id: state.advanceReceiptId,
    schedule_row_id: input.scheduleRowId,
    principal_amount: hundredthsToString(principal),
    gst_amount: hundredthsToString(gst),
    created_by: profile.id,
  })
  if (error) throw new Error(error.message)

  await reconcileBooking(supabase, input.bookingId, { actorId: profile.id })
  revalidatePath(`/bookings/${input.bookingId}`)
  revalidatePath('/demand-notes')
  return { success: true }
}
