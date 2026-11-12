import { randomUUID } from 'crypto'
import { after } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { formatInr, hundredthsToString } from '@/lib/booking/money'
import { formatPersonName } from '@/lib/booking/person'
import { formatLetterDate } from '@/lib/documents/inr-words'
import { paiseFrom } from '@/lib/demands/engine'
import { configProblems, emailConfig } from './config'
import { AUTOMATIC_EVENT_TYPES, eventKeys, type EventStatus } from './core'
import { bookingDocuments, demandNoteSelections, manualSelections, supabaseRenderer, type ManualCategory } from './documents'
import { createEmailEvent, type CreatedEvent, type EventDb, type NewEvent } from './events'
import { defaultSender } from './sender'
import { supabaseEmailStore } from './supabase-store'
import type { TemplateData } from './templates'
import { runQueue } from './worker'

type Row = Record<string, unknown>

/** True once supabase/migrations/011_email_delivery.sql has been run. */
export async function emailTablesReady(service: SupabaseClient): Promise<boolean> {
  const { error } = await service.from('email_events').select('id').limit(1)
  return !error
}

export function supabaseEventDb(service: SupabaseClient): EventDb {
  return {
    async insertEvent(row) {
      const { data, error } = await service.from('email_events').insert(row).select('id').single()
      if (error) {
        if (error.code === '23505') return 'duplicate'
        throw new Error(error.message)
      }
      return { id: data.id as string }
    },
    async findEventByKey(key) {
      const { data } = await service.from('email_events').select('id, status').eq('idempotency_key', key).maybeSingle()
      return data ? { id: data.id as string, status: data.status as EventStatus } : null
    },
    async activeRecipients() {
      const { data, error } = await service.from('company_email_recipients').select('id, email').eq('is_active', true).order('email')
      if (error) throw new Error(error.message)
      return (data || []).map((row) => ({ id: row.id as string, email: row.email as string }))
    },
    async insertDocuments(rows) {
      const { error } = await service.from('email_event_documents').insert(rows)
      if (error) throw new Error(error.message)
    },
    async insertDeliveries(rows) {
      const { error } = await service.from('email_deliveries').insert(rows)
      if (error) throw new Error(error.message)
    },
    async failEvent(id, message) {
      await service.from('email_events').update({ status: 'failed', last_error: message, completed_at: new Date().toISOString() }).eq('id', id)
    },
  }
}

function istDate(value: unknown): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date(String(value))).replace(/\//g, '.')
}

function people(booking: Row, coapplicants: Row[]) {
  return {
    primary: formatPersonName(booking.applicant_salutation as string, booking.applicant_name as string) || '—',
    others: coapplicants.map((person) => formatPersonName(person.salutation as string, person.name as string)).filter(Boolean),
  }
}

function amountDue(notes: Row[]): bigint {
  return notes.reduce(
    (sum, note) => sum + paiseFrom(note.installment_amount) + paiseFrom(note.gst_amount) - paiseFrom(note.principal_received_at_issue) - paiseFrom(note.gst_received_at_issue),
    0n
  )
}

/** Process events after the response is sent, so a slow or failed email never holds up a booking or milestone. */
export function processInBackground(eventIds: string[]) {
  const ids = eventIds.filter(Boolean)
  if (!ids.length) return
  const run = () =>
    processEmailQueue({ eventIds: ids }).catch((error) => {
      console.error('[email] background delivery failed:', error instanceof Error ? error.message : error)
    })
  try {
    after(run)
  } catch {
    void run()
  }
}

export async function processEmailQueue(options: { eventIds?: string[]; limit?: number } = {}) {
  const config = emailConfig()
  if (configProblems(config).length) return []
  const service = await createServiceClient()
  if (!(await emailTablesReady(service))) return []
  return runQueue(
    {
      store: supabaseEmailStore(service),
      renderer: supabaseRenderer(service),
      sender: defaultSender(),
      from: config.fromAddress as string,
      dailyLimit: config.dailyLimit,
      monthlyLimit: config.monthlyLimit,
      paused: config.paused,
    },
    options
  )
}

async function queue(service: SupabaseClient, input: NewEvent): Promise<CreatedEvent | null> {
  if (!(await emailTablesReady(service))) return null
  const created = await createEmailEvent(supabaseEventDb(service), input)
  if (created.created && created.status === 'queued') processInBackground([created.id])
  return created
}

/** Booking finalized: allotment letter, NOC, finalized agreement and every demand note already due, in one email. */
export async function queueBookingFinalized(bookingId: string, actorId?: string | null) {
  const service = await createServiceClient()
  if (!(await emailTablesReady(service))) return null
  const { booking, source, selections, omitted, noteCount } = await bookingDocuments(service, bookingId)
  const serial = String(booking.serial_display || 'Booking')
  const who = people(booking, (source.coapplicants as Row[]) || [])
  const template: TemplateData = {
    heading: 'New booking documents',
    intro: `A new booking for Flat ${booking.unit_no} has been finalized. Its documents are included below.`,
    rows: [
      ['Booking', serial],
      ['Project', String(booking.project_name || 'Anandam')],
      ['Flat', String(booking.unit_no || '—')],
      ['Primary applicant', who.primary],
      ...(who.others.length ? [['Co-applicants', who.others.join(', ')] as [string, string]] : []),
      ['Booking date', istDate(booking.submitted_at || booking.created_at)],
      ['Demand notes included', String(noteCount)],
    ],
    documents: selections.map((item) => ({ name: item.label, type: item.document_type })),
  }
  return queue(service, {
    type: 'booking_finalized',
    reference: serial,
    key: eventKeys.bookingFinalized(bookingId),
    subject: `ANANDAM | New Booking | ${serial} | Flat ${booking.unit_no}`,
    template,
    selections,
    omitted,
    createdBy: actorId,
    extra: { bookingId },
  })
}

/** Demand notes already emailed by an automatic event. */
async function automaticallyEmailed(service: SupabaseClient, noteIds: string[]): Promise<Set<string>> {
  const done = new Set<string>()
  if (!noteIds.length) return done
  const { data } = await service
    .from('email_event_documents')
    .select('document_id, event:email_events!inner(event_type)')
    .eq('document_type', 'demand_note')
    .in('document_id', noteIds)
  for (const row of (data || []) as Array<{ document_id: string; event: { event_type: string } | { event_type: string }[] }>) {
    const events = Array.isArray(row.event) ? row.event : [row.event]
    if (events.some((event) => AUTOMATIC_EVENT_TYPES.includes(event.event_type as never))) done.add(row.document_id)
  }
  return done
}

async function automationStart(service: SupabaseClient): Promise<string | null> {
  const { data } = await service.from('settings').select('email_automation_started_at').limit(1).maybeSingle()
  return (data?.email_automation_started_at as string) || null
}

/** Milestone completed: every newly due demand note for it, in one email. */
export async function queueMilestoneCompleted(milestoneId: string, actorId?: string | null) {
  const service = await createServiceClient()
  if (!(await emailTablesReady(service))) return null
  const { data: milestone } = await service.from('construction_milestones').select('id, label, completed_at, completion_version').eq('id', milestoneId).single()
  if (!milestone?.completed_at) return null
  const start = await automationStart(service)
  let query = service.from('demand_notes').select('*').eq('milestone_id', milestoneId).order('unit_no')
  if (start) query = query.gte('created_at', start)
  const { data: notes } = await query
  const emailed = await automaticallyEmailed(service, (notes || []).map((note) => note.id as string))
  const fresh = (notes || []).filter((note) => !emailed.has(note.id as string))
  if (!fresh.length) return null
  return queue(service, milestoneEvent(milestone, fresh, await demandNoteSelections(service, fresh), eventKeys.milestoneCompleted(milestone.id, Number(milestone.completion_version || 0)), actorId))
}

function milestoneEvent(milestone: Row, notes: Row[], selections: NewEvent['selections'], key: string, actorId?: string | null): NewEvent {
  const count = notes.length
  return {
    type: 'milestone_completed',
    reference: String(milestone.label),
    key,
    subject: `ANANDAM | ${milestone.label} Completed | ${count} Demand Note${count === 1 ? '' : 's'}`,
    template: {
      heading: 'Construction milestone demand notes',
      intro: `“${milestone.label}” has been marked completed. The demand notes it made due are included.`,
      rows: [
        ['Milestone', String(milestone.label)],
        ['Completed on', formatLetterDate(String(milestone.completed_at).slice(0, 10)) || '—'],
        ['Demand notes', String(count)],
        ['Total amount due', `${formatInr(hundredthsToString(amountDue(notes)))} incl. GST`],
      ],
      documents: selections.map((item) => ({ name: item.label, type: item.document_type })),
    },
    selections,
    createdBy: actorId,
    extra: { milestoneId: milestone.id },
  }
}

/**
 * Daily: demand notes that became due on a scheduled date, one email per date; and any
 * construction notes issued outside a milestone or booking email (for example after an edit),
 * so nothing due is left unsent. Only notes issued after email automation started are considered.
 */
export async function queueScheduledAndCatchUp() {
  const service = await createServiceClient()
  if (!(await emailTablesReady(service))) return []
  const start = await automationStart(service)
  // Leave a margin so a booking or milestone email being created right now claims its own notes first.
  const settled = new Date(Date.now() - 2 * 60_000).toISOString()
  let query = service.from('demand_notes').select('*').lte('created_at', settled).order('issue_date')
  if (start) query = query.gte('created_at', start)
  const { data: notes, error } = await query
  if (error) throw new Error(error.message)
  const emailed = await automaticallyEmailed(service, (notes || []).map((note) => note.id as string))
  const fresh = (notes || []).filter((note) => !emailed.has(note.id as string))
  if (!fresh.length) return []

  const rowIds = fresh.map((note) => note.schedule_row_id as string)
  const { data: rows } = await service.from('booking_schedule_rows').select('id, trigger_type, milestone_date').in('id', rowIds)
  const dateOf = new Map((rows || []).map((row) => [row.id as string, row.trigger_type === 'date' ? String(row.milestone_date || '').slice(0, 10) : null]))
  const byDate = new Map<string, Row[]>()
  const byMilestone = new Map<string, Row[]>()
  for (const note of fresh) {
    const date = dateOf.get(note.schedule_row_id as string)
    if (date) byDate.set(date, [...(byDate.get(date) || []), note])
    else if (note.milestone_id) byMilestone.set(note.milestone_id as string, [...(byMilestone.get(note.milestone_id as string) || []), note])
  }

  const created: Array<CreatedEvent | null> = []
  for (const [date, group] of byDate) {
    const selections = await demandNoteSelections(service, group)
    const shown = date.split('-').reverse().join('.')
    created.push(await queue(service, {
      type: 'scheduled_date',
      reference: shown,
      key: eventKeys.scheduledDate(date, group.map((note) => note.id as string)),
      subject: `ANANDAM | Installments Due ${shown} | ${group.length} Demand Note${group.length === 1 ? '' : 's'}`,
      template: {
        heading: 'Scheduled installment demand notes',
        intro: `Installments scheduled for ${shown} are now due. Their demand notes are included.`,
        rows: [
          ['Scheduled date', shown],
          ['Demand notes', String(group.length)],
          ['Total amount due', `${formatInr(hundredthsToString(amountDue(group)))} incl. GST`],
        ],
        documents: selections.map((item) => ({ name: item.label, type: item.document_type })),
      },
      selections,
      extra: { scheduledDate: date },
    }))
  }
  for (const [milestoneId, group] of byMilestone) {
    const { data: milestone } = await service.from('construction_milestones').select('id, label, completed_at').eq('id', milestoneId).single()
    if (!milestone) continue
    const selections = await demandNoteSelections(service, group)
    created.push(await queue(service, milestoneEvent(milestone, group, selections, eventKeys.milestoneCatchUp(milestoneId, group.map((note) => note.id as string)))))
  }
  return created.filter(Boolean) as CreatedEvent[]
}

const MANUAL_TITLES: Record<ManualCategory, string> = {
  allotment: 'Allotment Letters',
  noc: 'Bank NOCs',
  agreement: 'Agreements for Sale',
  demand_all: 'All Demand Notes',
  demand_group: 'Demand Notes',
}

export async function manualPreview(category: ManualCategory, groupNoteIds: string[] = []) {
  const service = await createServiceClient()
  const [{ selections, omitted }, recipients] = await Promise.all([
    manualSelections(service, category, groupNoteIds),
    supabaseEventDb(service).activeRecipients(),
  ])
  return { documents: selections.length, omitted: omitted.length, recipients: recipients.map((item) => item.email) }
}

export async function queueManual(category: ManualCategory, title: string | null, groupNoteIds: string[], actorId: string) {
  const service = await createServiceClient()
  const { selections, omitted } = await manualSelections(service, category, groupNoteIds)
  if (!selections.length) throw new Error('There are no documents to send in this group.')
  const name = title || MANUAL_TITLES[category]
  return queue(service, {
    type: 'manual_bulk',
    reference: name,
    key: `manual:${category}:${randomUUID()}`,
    subject: `ANANDAM | ${name} | ${selections.length} Document${selections.length === 1 ? '' : 's'}`,
    template: {
      heading: name,
      intro: 'These documents were sent on request from the ProjectDesk Downloads page.',
      rows: [
        ['Category', name],
        ['Documents', String(selections.length)],
        ['Requested on', istDate(new Date().toISOString())],
      ],
      documents: selections.map((item) => ({ name: item.label, type: item.document_type })),
    },
    selections,
    omitted,
    createdBy: actorId,
    extra: { category },
  })
}

export async function queueTest(onlyTo: string[] | null, actorId: string) {
  const service = await createServiceClient()
  const config = emailConfig()
  const created = await createEmailEvent(supabaseEventDb(service), {
    type: 'test',
    reference: 'Test',
    key: `test:${randomUUID()}`,
    subject: 'ANANDAM | Test Email from ProjectDesk',
    template: {
      heading: 'Test email',
      intro: 'This is a test from ProjectDesk. If you can read it, company email delivery is working for this address.',
      rows: [
        ['Sender', config.fromAddress || '—'],
        ['Sent on', new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })],
      ],
      documents: [],
    },
    selections: [],
    onlyTo: onlyTo || undefined,
    createdBy: actorId,
  })
  // A test is processed now, so the admin sees Resend's answer straight away.
  if (created.status === 'queued') await processEmailQueue({ eventIds: [created.id] })
  return created
}

/** Failed recipients only. Recipients already sent are never sent again by a retry. */
export async function retryFailed(eventId: string) {
  const service = await createServiceClient()
  const { data: failed } = await service.from('email_deliveries').select('id').eq('event_id', eventId).in('status', ['failed', 'bounced'])
  if (!failed?.length) throw new Error('No failed recipients to retry.')
  await service.from('email_deliveries').update({ status: 'queued', next_attempt_at: null, attempt_count: 0, last_error: null }).in('id', failed.map((row) => row.id))
  await service.from('email_events').update({ status: 'queued', next_attempt_at: null, completed_at: null }).eq('id', eventId).neq('status', 'processing')
  processInBackground([eventId])
  return { retried: failed.length }
}

/** An event that had no recipients is sent to the addresses active now. */
export async function sendAwaiting(eventId: string) {
  const service = await createServiceClient()
  const db = supabaseEventDb(service)
  const { data: event } = await service.from('email_events').select('id, status').eq('id', eventId).single()
  if (event?.status !== 'awaiting_recipients') throw new Error('This email is not waiting for recipients.')
  const active = await db.activeRecipients()
  if (!active.length) throw new Error('Add an active company recipient first.')
  await db.insertDeliveries(active.map((item) => ({ event_id: eventId, recipient_id: item.id, recipient_email: item.email })))
  await service.from('email_events').update({ status: 'queued', next_attempt_at: null }).eq('id', eventId)
  processInBackground([eventId])
  return { recipients: active.map((item) => item.email) }
}

/** A deliberate resend: a new event with the same documents, to everyone active now. */
export async function resendEvent(eventId: string, actorId: string) {
  const service = await createServiceClient()
  const { data: event } = await service.from('email_events').select('*').eq('id', eventId).single()
  if (!event) throw new Error('Email not found')
  const { data: docs } = await service.from('email_event_documents').select('*').eq('event_id', eventId).order('sort_order')
  const db = supabaseEventDb(service)
  const created = await createEmailEvent(db, {
    type: 'resend',
    reference: event.event_reference,
    key: `resend:${eventId}:${randomUUID()}`,
    subject: event.subject,
    template: (event.payload as Row)?.template as TemplateData,
    selections: [],
    createdBy: actorId,
    resendOf: eventId,
    extra: { resendOfSubject: event.subject },
  })
  if (docs?.length) {
    // The exact files that were sent before, from private storage.
    const { error } = await service.from('email_event_documents').insert(
      docs.map((doc) => ({
        event_id: created.id,
        document_type: doc.document_type,
        booking_id: doc.booking_id,
        document_id: doc.document_id,
        folder: doc.folder,
        file_name: doc.file_name,
        storage_path: doc.storage_path,
        file_bytes: doc.file_bytes,
        sort_order: doc.sort_order,
      }))
    )
    if (error) throw new Error(error.message)
    await service.from('email_events').update({ document_count: docs.length }).eq('id', created.id)
  }
  if (created.status === 'queued') processInBackground([created.id])
  return created
}

/** Daily and on every scheduler tick: scheduled-date emails, catch-up emails, then anything due to send or retry. */
export async function runEmailSchedule() {
  const created = await queueScheduledAndCatchUp()
  const processed = await processEmailQueue({ limit: 20 })
  return { created: created.length, processed: processed.length }
}
