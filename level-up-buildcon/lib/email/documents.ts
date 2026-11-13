import type { SupabaseClient } from '@supabase/supabase-js'
import { loadExtrasForBookings } from '@/lib/booking/persist-details'
import { agreementReadiness } from '@/lib/documents/agreement-ready'
import { loadAgreementDocument } from '@/lib/documents/agreement-load'
import { agreementPdf } from '@/lib/documents/agreement-pdf'
import { demandBlocks, snapshotFromStorage } from '@/lib/documents/demand-model'
import { buildLetter } from '@/lib/documents/letter-model'
import { generateBookingLetter, renderLetterPdf } from '@/lib/documents/letter-pdf'
import { FOLDERS, documentFileName, type DocumentType } from './core'
import type { DocumentRenderer, DocumentRow } from './worker'

type Row = Record<string, unknown>

/** A document chosen for an email. Only generated legal documents; uploaded KYC files are never included. */
export interface DocumentSelection {
  document_type: DocumentType
  booking_id: string | null
  document_id: string | null
  folder: string
  label: string
}

export interface Omission {
  name: string
  reason: string
}

function stageFolder(note: Row, dates: Map<string, string | null>): string {
  const date = dates.get(String(note.schedule_row_id))
  if (date) return `${FOLDERS.demand_note}/Scheduled ${date.split('-').reverse().join('.')}`
  return `${FOLDERS.demand_note}/${String(note.trigger_label || 'Installment')}`
}

/** Renders the same files the Downloads page and booking page produce. Nothing is changed while packaging. */
export function supabaseRenderer(service: SupabaseClient): DocumentRenderer {
  return {
    async render(doc: DocumentRow) {
      if (doc.document_type === 'allotment' || doc.document_type === 'noc') {
        const { data: booking, error } = await service.from('bookings').select('*').eq('id', doc.booking_id).single()
        if (error || !booking) throw new Error('Booking not found')
        const extras = (await loadExtrasForBookings(service, [booking.id])).get(booking.id)
        const buffer = await generateBookingLetter({ ...booking, ...extras }, doc.document_type)
        return {
          buffer,
          folder: doc.folder || FOLDERS[doc.document_type],
          fileName: documentFileName({ type: doc.document_type, serial: booking.serial_display, unit: booking.unit_no }),
        }
      }
      if (doc.document_type === 'agreement' && !doc.document_id) {
        // Generated now with the approved template, exactly as the agreement download does.
        // The PDF is attached; the Word file it was set from is kept with it in storage.
        const { booking, docx } = await loadAgreementDocument(service, doc.booking_id as string)
        const name = { type: 'agreement' as const, serial: booking.serial_display, unit: booking.unit_no }
        return {
          buffer: await agreementPdf(docx),
          folder: doc.folder || FOLDERS.agreement,
          fileName: documentFileName(name),
          companion: { fileName: documentFileName({ ...name, extension: 'docx' }), buffer: docx },
        }
      }
      if (doc.document_type === 'agreement') {
        const { data: file, error } = await service
          .from('booking_generated_documents')
          .select('version, pdf_base64, docx_base64, booking_id, finalized')
          .eq('id', doc.document_id)
          .single()
        if (error || !file || !file.finalized) throw new Error('Finalized Agreement for Sale not found')
        const { data: booking } = await service.from('bookings').select('serial_display, unit_no').eq('id', file.booking_id).single()
        if (!file.pdf_base64 && !file.docx_base64) throw new Error('The finalized agreement has no stored file')
        // A version frozen without a PDF is set from its own frozen Word file, unchanged.
        const docx = file.docx_base64 ? Buffer.from(file.docx_base64, 'base64') : null
        const buffer = file.pdf_base64 ? Buffer.from(file.pdf_base64, 'base64') : await agreementPdf(docx as Buffer)
        const name = { type: 'agreement' as const, serial: booking?.serial_display, unit: booking?.unit_no, version: Number(file.version) }
        return {
          buffer,
          folder: doc.folder || FOLDERS.agreement,
          fileName: documentFileName(name),
          companion: docx ? { fileName: documentFileName({ ...name, extension: 'docx' }), buffer: docx } : undefined,
        }
      }
      const { data: note, error } = await service.from('demand_notes').select('*').eq('id', doc.document_id).single()
      if (error || !note) throw new Error('Demand note not found')
      const { data: booking } = await service.from('bookings').select('serial_display').eq('id', note.booking_id).single()
      // The note as issued: its stored snapshot, not today's figures.
      const buffer = await renderLetterPdf(demandBlocks(snapshotFromStorage(note.snapshot as Row)))
      return {
        buffer,
        folder: doc.folder || FOLDERS.demand_note,
        fileName: documentFileName({ type: 'demand_note', serial: booking?.serial_display, unit: note.unit_no, stage: note.trigger_label, reference: note.reference_number }),
      }
    },
  }
}

async function scheduleDates(service: SupabaseClient, rowIds: string[]) {
  const dates = new Map<string, string | null>()
  if (!rowIds.length) return dates
  const { data } = await service.from('booking_schedule_rows').select('id, trigger_type, milestone_date').in('id', rowIds)
  for (const row of data || []) dates.set(row.id, row.trigger_type === 'date' ? String(row.milestone_date || '').slice(0, 10) || null : null)
  return dates
}

export async function demandNoteSelections(service: SupabaseClient, notes: Row[]): Promise<DocumentSelection[]> {
  const dates = await scheduleDates(service, notes.map((note) => String(note.schedule_row_id)))
  return notes.map((note) => ({
    document_type: 'demand_note',
    booking_id: String(note.booking_id),
    document_id: String(note.id),
    folder: stageFolder(note, dates),
    label: `${note.reference_number} · Flat ${note.unit_no} · ${note.trigger_label}`,
  }))
}

type Extras = Awaited<ReturnType<typeof loadExtrasForBookings>> extends Map<string, infer V> ? V : never

/**
 * The booking's Agreement for Sale, the same file the agreement download returns: the frozen
 * copy if one was finalized, otherwise generated from the booking with the approved template.
 * Developer and landowner flats use the same approved template.
 */
async function agreementSelection(service: SupabaseClient, booking: Row, extras: Extras | undefined): Promise<DocumentSelection | Omission> {
  const serial = String(booking.serial_display || 'Booking')
  const { data: frozen } = await service
    .from('booking_generated_documents')
    .select('id, version')
    .eq('booking_id', booking.id)
    .eq('kind', 'agreement')
    .eq('finalized', true)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (frozen) {
    return { document_type: 'agreement', booking_id: String(booking.id), document_id: frozen.id, folder: FOLDERS.agreement, label: `Agreement for Sale · ${serial} · Flat ${booking.unit_no}` }
  }
  const { data: payments } = await service.from('booking_payment_entries').select('*').eq('booking_id', booking.id).order('sort_order')
  const ready = agreementReadiness(booking, {
    coapplicants: (extras?.coapplicants as Row[]) || [],
    payments: payments || [],
    schedule: (extras?.schedule_rows as Row[]) || [],
  })
  if (!ready.input) return { name: 'Agreement for Sale', reason: ready.issues[0] || 'The agreement could not be generated.' }
  return { document_type: 'agreement', booking_id: String(booking.id), document_id: null, folder: FOLDERS.agreement, label: `Agreement for Sale · ${serial} · Flat ${booking.unit_no}` }
}

/** Everything that belongs in the new-booking email, and what could not be included and why. */
export async function bookingDocuments(service: SupabaseClient, bookingId: string) {
  const { data: booking, error } = await service.from('bookings').select('*').eq('id', bookingId).single()
  if (error || !booking) throw new Error('Booking not found')
  const extras = (await loadExtrasForBookings(service, [bookingId])).get(bookingId)
  const source = { ...booking, ...extras }
  const selections: DocumentSelection[] = []
  const omitted: Omission[] = []
  const serial = booking.serial_display || 'Booking'

  const allotment = buildLetter(source, 'allotment')
  if (allotment.issues.length) omitted.push({ name: 'Allotment Letter', reason: allotment.issues[0] })
  else selections.push({ document_type: 'allotment', booking_id: bookingId, document_id: null, folder: FOLDERS.allotment, label: `Allotment Letter · ${serial} · Flat ${booking.unit_no}` })

  if (booking.noc_required) {
    const noc = buildLetter(source, 'noc')
    if (noc.issues.length) omitted.push({ name: 'Bank NOC', reason: noc.issues[0] })
    else selections.push({ document_type: 'noc', booking_id: bookingId, document_id: null, folder: FOLDERS.noc, label: `Bank NOC · ${serial} · Flat ${booking.unit_no}` })
  }

  const agreement = await agreementSelection(service, booking, extras)
  if ('reason' in agreement) omitted.push(agreement)
  else selections.push(agreement)

  const { data: notes } = await service.from('demand_notes').select('*').eq('booking_id', bookingId).order('issue_date')
  selections.push(...(await demandNoteSelections(service, notes || [])))
  return { booking, source, selections, omitted, noteCount: (notes || []).length }
}

/** Active, non-draft, non-deleted bookings. */
async function activeBookings(service: SupabaseClient) {
  const { data, error } = await service
    .from('bookings')
    .select('*')
    .in('status', ['SUBMITTED', 'EDITED'])
    .is('deleted_at', null)
    .order('serial_no')
  if (error) throw new Error(error.message)
  return data || []
}

export type ManualCategory = 'allotment' | 'noc' | 'agreement' | 'demand_all' | 'demand_group'

export async function manualSelections(service: SupabaseClient, category: ManualCategory, groupNoteIds: string[] = []) {
  const selections: DocumentSelection[] = []
  const omitted: Omission[] = []
  if (category === 'allotment' || category === 'noc') {
    const bookings = (await activeBookings(service)).filter((booking) => category === 'allotment' || booking.noc_required)
    const extras = await loadExtrasForBookings(service, bookings.map((booking) => booking.id))
    for (const booking of bookings) {
      const letter = buildLetter({ ...booking, ...extras.get(booking.id) }, category)
      const name = `${category === 'noc' ? 'Bank NOC' : 'Allotment Letter'} · ${booking.serial_display || 'Booking'} · Flat ${booking.unit_no}`
      if (letter.issues.length) omitted.push({ name, reason: letter.issues[0] })
      else selections.push({ document_type: category, booking_id: booking.id, document_id: null, folder: FOLDERS[category], label: name })
    }
    return { selections, omitted }
  }
  if (category === 'agreement') {
    const bookings = await activeBookings(service)
    const extras = await loadExtrasForBookings(service, bookings.map((booking) => booking.id))
    for (const booking of bookings) {
      const agreement = await agreementSelection(service, booking, extras.get(booking.id))
      if ('reason' in agreement) omitted.push({ name: `Agreement for Sale · ${booking.serial_display || 'Booking'} · Flat ${booking.unit_no}`, reason: agreement.reason })
      else selections.push(agreement)
    }
    return { selections, omitted }
  }
  const bookingIds = (await activeBookings(service)).map((booking) => booking.id)
  let query = service.from('demand_notes').select('*').order('issue_date')
  if (category === 'demand_group') {
    if (!groupNoteIds.length) return { selections, omitted }
    query = query.in('id', groupNoteIds)
  } else if (bookingIds.length) {
    query = query.in('booking_id', bookingIds)
  } else {
    return { selections, omitted }
  }
  const { data: notes, error } = await query
  if (error) throw new Error(error.message)
  selections.push(...(await demandNoteSelections(service, notes || [])))
  return { selections, omitted }
}
