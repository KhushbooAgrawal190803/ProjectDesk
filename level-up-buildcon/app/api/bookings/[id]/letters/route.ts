import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { loadExtrasForBookings } from '@/lib/booking/persist-details'
import { assertCanDownloadPdfs } from '@/lib/auth/permissions'
import { jsonAuthError } from '@/lib/api/auth-response'
import { generateBookingLetter } from '@/lib/documents/letter-pdf'
import { LetterNotReadyError, type LetterKind } from '@/lib/documents/letter-model'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function letterKind(value: string | null): LetterKind | null {
  if (value === 'allotment' || value === 'noc') return value
  return null
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const kind = letterKind(request.nextUrl.searchParams.get('kind'))
    if (!kind) {
      return NextResponse.json({ error: 'Choose an allotment letter or a NOC' }, { status: 400 })
    }

    const profile = await requireStaff()
    const supabase = await createClient()
    const { data: booking, error } = await supabase.from('bookings').select('*').eq('id', id).single()
    if (error || !booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }
    assertCanDownloadPdfs(profile, booking)

    const extras = (await loadExtrasForBookings(supabase, [booking.id])).get(booking.id)
    const pdf = await generateBookingLetter({ ...booking, ...extras }, kind)
    const safeSerial = String(booking.serial_display || booking.unit_no || 'Booking').replace(/[^\w.-]+/g, '_')
    const filename = `${safeSerial}_${kind === 'noc' ? 'NOC' : 'Allotment'}.pdf`
    const download = request.nextUrl.searchParams.get('download') === '1'

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    const authResp = jsonAuthError(error)
    if (authResp) return authResp
    if (error instanceof LetterNotReadyError) {
      return NextResponse.json({ error: error.issues[0], issues: error.issues }, { status: 422 })
    }
    console.error('[letter-pdf] generation failed')
    return NextResponse.json({ error: 'Failed to generate the letter' }, { status: 500 })
  }
}
