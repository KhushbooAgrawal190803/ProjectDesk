import { NextRequest, NextResponse } from 'next/server'
import { zipFiles } from '@/lib/downloads/zip'
import { getOwnerTypeForFlat } from '@/lib/data/flat-ownership'
import { loadAgreementDocument } from '@/lib/documents/agreement-load'
import { OfficeConversionError, convertDocxToPdf } from '@/lib/documents/docx-to-pdf'
import { requireStaff } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { jsonAuthError } from '@/lib/api/auth-response'
import { loadExtrasForBookings } from '@/lib/booking/persist-details'
import { generateBookingLetter, renderLetterPdf } from '@/lib/documents/letter-pdf'
import { LetterNotReadyError } from '@/lib/documents/letter-model'
import { demandBlocks, snapshotFromStorage } from '@/lib/documents/demand-model'
import { DEMAND_TIMEZONE, todayInTimeZone } from '@/lib/demands/engine'
import { loadDemandGroups } from '@/lib/downloads/groups'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

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
      // The same file as each booking's agreement download: the finalized copy, otherwise generated now.
      const { data: bookings, error } = await supabase.from('bookings').select('id, serial_display, unit_no').neq('status', 'DRAFT').is('deleted_at', null).order('serial_no')
      if (error) throw new Error(error.message)
      const { data: frozen } = await supabase
        .from('booking_generated_documents')
        .select('booking_id, version, pdf_base64, docx_base64')
        .eq('kind', 'agreement')
        .eq('finalized', true)
        .order('version', { ascending: false })
      for (const booking of bookings || []) {
        if (getOwnerTypeForFlat(booking.unit_no) !== 'DEVELOPER') continue
        const name = `${booking.serial_display || booking.unit_no}-agreement`.replace(/[^\w.-]+/g, '_')
        const stored = (frozen || []).find((row) => row.booking_id === booking.id)
        if (stored?.pdf_base64) {
          files.push({ name: `${name}.pdf`, buffer: Buffer.from(stored.pdf_base64, 'base64') })
          continue
        }
        if (stored?.docx_base64) {
          files.push({ name: `${name}.pdf`, buffer: await convertDocxToPdf(Buffer.from(stored.docx_base64, 'base64')) })
          continue
        }
        try {
          const { docx } = await loadAgreementDocument(supabase, booking.id)
          files.push({ name: `${name}.pdf`, buffer: await convertDocxToPdf(docx) })
        } catch (notReady) {
          if (!(notReady instanceof Error && notReady.name === 'AgreementNotReady')) throw notReady
        }
      }
    } else if (kind === 'demand') {
      const groupKey = request.nextUrl.searchParams.get('group') || ''
      const today = todayInTimeZone(new Date(), DEMAND_TIMEZONE)
      const { groups, notes } = await loadDemandGroups(supabase, today)
      const match = groups.find((group) => group.key === groupKey)
      const chosen = new Set(match?.noteIds || [])
      for (const note of notes) {
        if (!chosen.has(String(note.id))) continue
        const pdf = await renderLetterPdf(demandBlocks(snapshotFromStorage(note.snapshot as Record<string, unknown>)))
        files.push({ name: `${String(note.reference_number).replace(/[^\w.-]+/g, '_')}.pdf`, buffer: pdf })
      }
    } else if (kind === 'demand_all') {
      const today = todayInTimeZone(new Date(), DEMAND_TIMEZONE)
      const { groups, notes } = await loadDemandGroups(supabase, today)
      const byId = new Map(notes.map((note) => [String(note.id), note]))
      for (const group of groups) {
        const folder = group.kind === 'date' ? `Scheduled ${group.title}` : group.title
        for (const id of group.noteIds) {
          const note = byId.get(id)
          if (!note) continue
          const pdf = await renderLetterPdf(demandBlocks(snapshotFromStorage(note.snapshot as Record<string, unknown>)))
          files.push({ name: `Demand Notes/${folder.replace(/[\\/:*?"<>|]+/g, '-')}/${String(note.reference_number).replace(/[^\w.-]+/g, '_')}.pdf`, buffer: pdf })
        }
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
    const status = error instanceof OfficeConversionError ? 503 : 500
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not build the archive' }, { status })
  }
}
