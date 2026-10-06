import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { generateCompanyPDF, generateCustomerPDF } from '@/lib/pdf/generator'
import { assertCanDownloadPdfs } from '@/lib/auth/permissions'
import { jsonAuthError } from '@/lib/api/auth-response'
import archiver from 'archiver'
import { Writable } from 'stream'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const createZipBuffer = async (files: { name: string; buffer: Buffer }[]): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const stream = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        chunks.push(chunk)
        callback()
      },
    })

    const archive = archiver('zip', { zlib: { level: 9 } })
    archive.on('error', reject)
    stream.on('finish', () => resolve(Buffer.concat(chunks)))
    archive.pipe(stream)
    files.forEach(({ name, buffer }) => archive.append(buffer, { name }))
    archive.finalize()
  })
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const profile = await requireStaff()
    const supabase = await createClient()

    const { data: booking, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    assertCanDownloadPdfs(profile, booking)

    const [companyPDF, customerPDF] = await Promise.all([
      generateCompanyPDF(booking),
      generateCustomerPDF(booking),
    ])

    const safeSerial = (booking.serial_display || 'Booking').replace(/\//g, '_')
    const zipBuffer = await createZipBuffer([
      { name: `${safeSerial}_Company.pdf`, buffer: companyPDF },
      { name: `${safeSerial}_Customer.pdf`, buffer: customerPDF },
    ])

    return new NextResponse(zipBuffer as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${safeSerial}_Bookings.zip"`,
      },
    })
  } catch (error) {
    const authResp = jsonAuthError(error)
    if (authResp) return authResp
    console.error('[pdf-download] generation failed')
    return NextResponse.json({ error: 'Failed to generate PDFs' }, { status: 500 })
  }
}
