import { NextRequest, NextResponse } from 'next/server'
import archiver from 'archiver'
import { Writable } from 'stream'
import { requireStaff } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { jsonAuthError } from '@/lib/api/auth-response'
import { loadExtrasForBookings } from '@/lib/booking/persist-details'
import { generateBookingLetter, renderLetterPdf } from '@/lib/documents/letter-pdf'
import { LetterNotReadyError } from '@/lib/documents/letter-model'
import { demandBlocks, snapshotFromStorage } from '@/lib/documents/demand-model'
import { DEMAND_TIMEZONE, todayInTimeZone } from '@/lib/demands/engine'
import { groupDemandDownloads } from '@/lib/downloads/groups'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function zipFiles(files: { name: string; buffer: Buffer }[]): Promise<Buffer> {
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
    for (const file of files) archive.append(file.buffer, { name: file.name })
    archive.finalize()
  })
}

export async function GET(request: NextRequest) {
  try {
    await requireStaff()
    const supabase = await createClient()
    const kind = request.nextUrl.searchParams.get('kind')
    const files: { name: string; buffer: Buffer }[] = []

    if (kind === 'allotment' || kind === 'noc') {
      let query = supabase.from('bookings').select('*').neq('status', 'DRAFT').is('deleted_at', null)
      if (kind === 'noc') query = query.eq('noc_required', true)
      const { data: bookings, error } = await query
      if (error) throw new Error(error.message)
      const extras = await loadExtrasForBookings(supabase, (bookings || []).map((booking) => booking.id))
      for (const booking of bookings || []) {
        try {
          const pdf = await generateBookingLetter({ ...booking, ...extras.get(booking.id) }, kind)
          files.push({ name: `${booking.serial_display || booking.unit_no || booking.id}-${kind}.pdf`, buffer: pdf })
        } catch (error) {
          if (!(error instanceof LetterNotReadyError)) throw error
        }
      }
    } else if (kind === 'agreement') {
      const { data, error } = await supabase
        .from('booking_generated_documents')
        .select('booking_id, version, pdf_base64, docx_base64')
        .eq('kind', 'agreement')
        .eq('finalized', true)
      if (error) throw new Error(error.message)
      for (const row of data || []) {
        const encoded = row.pdf_base64 || row.docx_base64
        if (!encoded) continue
        const extension = row.pdf_base64 ? 'pdf' : 'docx'
        files.push({
          name: `agreement-${row.booking_id}-v${row.version}.${extension}`,
          buffer: Buffer.from(encoded, 'base64'),
        })
      }
    } else if (kind === 'demand') {
      const groupKey = request.nextUrl.searchParams.get('group') || ''
      const today = todayInTimeZone(new Date(), DEMAND_TIMEZONE)
      const [{ data: notes }, { data: rows }] = await Promise.all([
        supabase.from('demand_notes').select('*'),
        supabase.from('booking_schedule_rows').select('id, label, trigger_type, milestone_date'),
      ])
      const noteByRow = new Map((notes || []).map((note) => [note.schedule_row_id as string, note]))
      const match = groupDemandDownloads((rows || []).map((row) => {
        const note = noteByRow.get(row.id as string)
        const dateTitle = row.trigger_type === 'date' && row.milestone_date
          ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${row.milestone_date}T00:00:00Z`))
          : ''
        return {
          trigger: dateTitle || (note?.trigger_label as string) || (row.label as string) || 'Installment',
          due: Boolean(note) || (row.trigger_type === 'date' && String(row.milestone_date) <= today),
          noteId: (note?.id as string) || null,
        }
      })).find((group) => group.key === groupKey)
      const chosen = new Set(match?.noteIds || [])
      for (const note of notes || []) {
        if (!chosen.has(note.id)) continue
        const pdf = await renderLetterPdf(demandBlocks(snapshotFromStorage(note.snapshot as Record<string, unknown>)))
        files.push({ name: `${String(note.reference_number).replace(/[^\w.-]+/g, '_')}.pdf`, buffer: pdf })
      }
    } else {
      return NextResponse.json({ error: 'Choose a download group' }, { status: 400 })
    }

    if (!files.length) return NextResponse.json({ error: 'Nothing in this group is ready to download' }, { status: 404 })
    const zip = await zipFiles(files)
    return new NextResponse(new Uint8Array(zip), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${kind}-documents.zip"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    const authResp = jsonAuthError(error)
    if (authResp) return authResp
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not build the archive' }, { status: 500 })
  }
}
