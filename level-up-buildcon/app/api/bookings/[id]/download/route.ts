import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { generateCompanyPDF, generateCustomerPDF } from '@/lib/pdf/generator'
import archiver from 'archiver'
import { Writable } from 'stream'

// Create a zip buffer from files
const createZipBuffer = async (files: { name: string; buffer: Buffer }[]): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const stream = new Writable({
      write(chunk: any, encoding: any, callback: any) {
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await requireProfile()

    const supabase = await createClient()

    // Fetch booking
    const { data: booking, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    // Generate PDFs
    const [companyPDF, customerPDF] = await Promise.all([
      generateCompanyPDF(booking),
      generateCustomerPDF(booking),
    ])

    // Create zip file
    const zipBuffer = await createZipBuffer([
      {
        name: `${booking.serial_display}_Company.pdf`,
        buffer: companyPDF,
      },
      {
        name: `${booking.serial_display}_Customer.pdf`,
        buffer: customerPDF,
      },
    ])

    // Return zip file
    return new NextResponse(zipBuffer as any, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${booking.serial_display}_Bookings.zip"`,
      },
    })
  } catch (error) {
    console.error('PDF generation error:', error)
    return NextResponse.json(
      { error: 'Failed to generate PDFs' },
      { status: 500 }
    )
  }
}
