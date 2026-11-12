'use server'

import { revalidatePath } from 'next/cache'
import { requireStaff } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { assertCanDownloadPdfs } from '@/lib/auth/permissions'
import { loadAgreementDocument } from '@/lib/documents/agreement-load'
import { convertDocxToPdf } from '@/lib/documents/docx-to-pdf'

export async function finalizeAgreement(bookingId: string) {
  const profile = await requireStaff()
  const supabase = await createClient()
  const { data: booking } = await supabase.from('bookings').select('id, status, created_by, deleted_at').eq('id', bookingId).single()
  if (!booking) throw new Error('Booking not found')
  assertCanDownloadPdfs(profile, booking)

  const { data: existing } = await supabase
    .from('booking_generated_documents')
    .select('id')
    .eq('booking_id', bookingId)
    .eq('kind', 'agreement')
    .eq('finalized', true)
    .limit(1)
  if (existing && existing.length) throw new Error('This agreement is already finalized. Later payments do not change it.')

  const { docx, input } = await loadAgreementDocument(supabase, bookingId)
  // The frozen version always has its PDF. If the PDF service is unavailable, nothing is frozen.
  let pdf: Buffer
  try {
    pdf = await convertDocxToPdf(docx)
  } catch (error) {
    throw new Error(`The agreement was not finalized because its PDF could not be created. ${error instanceof Error ? error.message : ''} Try again shortly.`)
  }
  const pdfWarning = ''

  const { data: versions } = await supabase
    .from('booking_generated_documents')
    .select('version')
    .eq('booking_id', bookingId)
    .eq('kind', 'agreement')
    .order('version', { ascending: false })
    .limit(1)
  const version = Number(versions?.[0]?.version || 0) + 1
  const { error } = await supabase.from('booking_generated_documents').insert({
    booking_id: bookingId,
    kind: 'agreement',
    version,
    finalized: true,
    snapshot: JSON.parse(JSON.stringify(input, (_key, value) => (typeof value === 'bigint' ? value.toString() : value))),
    docx_base64: docx.toString('base64'),
    pdf_base64: pdf.toString('base64'),
    created_by: profile.id,
  })
  if (error) throw new Error(`${error.message} Run supabase/migrations/009_agreement_finance.sql if this table is missing.`)
  revalidatePath(`/bookings/${bookingId}`)
  return { version, pdfWarning }
}
