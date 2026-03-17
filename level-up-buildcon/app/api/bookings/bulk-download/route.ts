import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/get-user'
import { createServiceClient } from '@/lib/supabase/server'
import { generateCompanyPDF, generateCustomerPDF } from '@/lib/pdf/generator'
import archiver from 'archiver'
import { Writable } from 'stream'

type Kind = 'company' | 'customer' | 'both'

// Create a zip buffer from files
const createZipBuffer = async (files: { name: string; buffer: Buffer }[]): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const stream = new Writable({
      write(chunk: any, _encoding: any, callback: any) {
        chunks.push(chunk)
        callback()
      },
    })

    const archive = archiver('zip', { zlib: { level: 9 } })

    archive.on('error', reject)
    stream.on('finish', () => resolve(Buffer.concat(chunks)))

    archive.pipe(stream)

    files.forEach(({ name, buffer }) => {
      archive.append(buffer, { name })
    })

    archive.finalize()
  })
}

export async function GET(request: NextRequest) {
  try {
    await requireProfile()
    const supabase = await createServiceClient()

    const kind = (request.nextUrl.searchParams.get('kind') || 'company') as Kind

    // Only non-draft, non-deleted bookings
    const { data: bookings, error } = await supabase
      .from('bookings')
      .select('*')
      .neq('status', 'DRAFT')
      .is('deleted_at', null)
      .order('submitted_at', { ascending: true })

    if (error || !bookings || bookings.length === 0) {
      return NextResponse.json(
        { error: 'No bookings found to download' },
        { status: 404 }
      )
    }

    const files: { name: string; buffer: Buffer }[] = []

    for (const booking of bookings as any[]) {
      const safeSerial = (booking.serial_display || 'Booking').replace(/\//g, '_')

      if (kind === 'company' || kind === 'both') {
        const pdf = await generateCompanyPDF(booking)
        files.push({
          name: `${safeSerial}_Company.pdf`,
          buffer: pdf,
        })
      }

      if (kind === 'customer' || kind === 'both') {
        const pdf = await generateCustomerPDF(booking)
        files.push({
          name: `${safeSerial}_Customer.pdf`,
          buffer: pdf,
        })
      }
    }

    const zipBuffer = await createZipBuffer(files)

    const filenameBase =
      kind === 'company' ? 'Company_PDFs' : kind === 'customer' ? 'Customer_PDFs' : 'Bookings_PDFs'

    return new NextResponse(zipBuffer as any, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filenameBase}.zip"`,
      },
    })
  } catch (error) {
    console.error('Bulk PDF generation error:', error)
    return NextResponse.json(
      { error: 'Failed to generate bulk PDFs' },
      { status: 500 }
    )
  }
}

