'use server'

import { revalidatePath } from 'next/cache'
import { requireStaff } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { assertCanDownloadPdfs } from '@/lib/auth/permissions'
import { loadAgreementDocument } from '@/lib/documents/agreement-load'
import { convertDocxToPdf } from '@/lib/documents/soffice'

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
  let pdf: Buffer | null = null
  let pdfWarning = ''
  try {
    pdf = await convertDocxToPdf(docx)
  } catch (error) {
    pdfWarning = error instanceof Error ? error.message : 'The PDF could not be created.'
  }

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
    pdf_base64: pdf ? pdf.toString('base64') : null,
    created_by: profile.id,
  })
  if (error) throw new Error(`${error.message} Run supabase/migrations/009_agreement_finance.sql if this table is missing.`)
  revalidatePath(`/bookings/${bookingId}`)
  return { version, pdfWarning }
}
