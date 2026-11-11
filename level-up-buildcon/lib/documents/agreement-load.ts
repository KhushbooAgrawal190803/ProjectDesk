import type { SupabaseClient } from '@supabase/supabase-js'
import { loadBookingExtras } from '@/lib/booking/persist-details'
import { agreementReadiness } from '@/lib/documents/agreement-ready'
import { buildAgreementDocx } from '@/lib/documents/agreement'

export async function loadAgreementDocument(supabase: SupabaseClient, bookingId: string) {
  const { data: booking, error } = await supabase.from('bookings').select('*').eq('id', bookingId).single()
  if (error || !booking) throw new Error('Booking not found')
  const extras = await loadBookingExtras(supabase, bookingId)
  const ready = agreementReadiness(booking, {
    coapplicants: extras.coapplicants,
    payments: extras.payment_entries,
    schedule: extras.schedule_rows,
  })
  if (!ready.input) {
    const failure = new Error(ready.issues.join(' '))
    failure.name = 'AgreementNotReady'
    throw failure
  }
  const docx = await buildAgreementDocx(ready.input)
  return { booking, input: ready.input, docx, issues: ready.issues, warnings: ready.warnings }
}
