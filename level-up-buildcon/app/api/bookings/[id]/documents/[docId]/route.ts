import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { assertCanViewBooking } from '@/lib/auth/permissions'
import { jsonAuthError } from '@/lib/api/auth-response'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    const { id, docId } = await params
    const profile = await requireStaff()
    const supabase = await createClient()

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, status, created_by, deleted_at')
      .eq('id', id)
      .single()

    if (bookingError || !booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    assertCanViewBooking(profile, booking)

    const { data: doc, error } = await supabase
      .from('booking_documents')
      .select('*')
      .eq('id', docId)
      .eq('booking_id', id)
      .single()

    if (error || !doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    const { data: signedData } = await supabase.storage
      .from('booking-documents')
      .createSignedUrl(doc.file_path, 3600)

    if (!signedData?.signedUrl) {
      return NextResponse.json({ error: 'Failed to generate download URL' }, { status: 500 })
    }

    return NextResponse.redirect(signedData.signedUrl)
  } catch (error) {
    const authResp = jsonAuthError(error)
    if (authResp) return authResp
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
