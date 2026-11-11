import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { assertCanDownloadPdfs } from '@/lib/auth/permissions'
import { jsonAuthError } from '@/lib/api/auth-response'
import { loadAgreementDocument } from '@/lib/documents/agreement-load'
import { OfficeConversionError, convertDocxToPdf } from '@/lib/documents/soffice'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function storedFile(row: { docx_base64?: string | null; pdf_base64?: string | null }, format: 'docx' | 'pdf') {
  const encoded = format === 'pdf' ? row.pdf_base64 : row.docx_base64
  if (!encoded) return null
  return Buffer.from(encoded, 'base64')
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const profile = await requireStaff()
    const supabase = await createClient()
    const { data: booking } = await supabase.from('bookings').select('id, status, created_by, deleted_at, unit_no').eq('id', id).single()
    if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    assertCanDownloadPdfs(profile, booking)

    const format = request.nextUrl.searchParams.get('format') === 'docx' ? 'docx' : 'pdf'
    const preview = request.nextUrl.searchParams.get('preview') === '1'
    const download = request.nextUrl.searchParams.get('download') === '1'
    const filename = `agreement-${booking.unit_no || id}.${format}`

    if (!preview) {
      const { data: frozen } = await supabase
        .from('booking_generated_documents')
        .select('docx_base64, pdf_base64, version')
        .eq('booking_id', id)
        .eq('kind', 'agreement')
        .eq('finalized', true)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle()
      const bytes = frozen ? storedFile(frozen, format) : null
      if (bytes) {
        return new NextResponse(new Uint8Array(bytes), {
          headers: {
            'Content-Type': format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
            'Cache-Control': 'private, max-age=3600',
          },
        })
      }
    }

    const { docx } = await loadAgreementDocument(supabase, id)
    const body = format === 'docx' ? docx : await convertDocxToPdf(docx)
    return new NextResponse(new Uint8Array(body), {
      headers: {
        'Content-Type': format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    const authResp = jsonAuthError(error)
    if (authResp) return authResp
    const message = error instanceof Error ? error.message : 'Could not create the agreement'
    const status = error instanceof OfficeConversionError ? 503 : error instanceof Error && error.name === 'AgreementNotReady' ? 422 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
