import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { generateCompanyPDF, generateCustomerPDF } from '@/lib/pdf/generator'
import { jsonAuthError } from '@/lib/api/auth-response'
import archiver from 'archiver'
import { Writable } from 'stream'

type Kind = 'company' | 'customer' | 'both'

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

export async function GET(request: NextRequest) {
  try {
    await requireStaff()
    const supabase = await createClient()
    const kind = (request.nextUrl.searchParams.get('kind') || 'company') as Kind

    const { data: bookings, error } = await supabase
      .from('bookings')
      .select('*')
      .neq('status', 'DRAFT')
      .is('deleted_at', null)
      .order('submitted_at', { ascending: true })

    if (error || !bookings?.length) {
      return NextResponse.json({ error: 'No bookings found to download' }, { status: 404 })
    }

    const files: { name: string; buffer: Buffer }[] = []

    for (const booking of bookings) {
      const safeSerial = (booking.serial_display || booking.id.slice(0, 8)).replace(/\//g, '_')
      if (kind === 'company' || kind === 'both') {
        files.push({ name: `${safeSerial}_Company.pdf`, buffer: await generateCompanyPDF(booking) })
      }
      if (kind === 'customer' || kind === 'both') {
        files.push({ name: `${safeSerial}_Customer.pdf`, buffer: await generateCustomerPDF(booking) })
      }
    }

    const zipBuffer = await createZipBuffer(files)

    return new NextResponse(zipBuffer as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="ProjectDesk_Bookings_${kind}.zip"`,
      },
    })
  } catch (error) {
    const authResp = jsonAuthError(error)
    if (authResp) return authResp
    console.error('[bulk-download] failed')
    return NextResponse.json({ error: 'Failed to generate bulk download' }, { status: 500 })
  }
}
