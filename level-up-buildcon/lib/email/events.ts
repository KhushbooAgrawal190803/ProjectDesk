import type { DocumentSelection, Omission } from './documents'
import type { EventStatus, EventType } from './core'
import type { TemplateData } from './templates'

export interface NewEvent {
  type: EventType
  reference: string | null
  key: string
  subject: string
  template: TemplateData
  selections: DocumentSelection[]
  omitted?: Omission[]
  createdBy?: string | null
  resendOf?: string | null
  /** Send to these addresses instead of all active recipients (test emails only). */
  onlyTo?: string[]
  extra?: Record<string, unknown>
}

export interface EventDb {
  insertEvent(row: Record<string, unknown>): Promise<{ id: string } | 'duplicate'>
  findEventByKey(key: string): Promise<{ id: string; status: EventStatus } | null>
  activeRecipients(): Promise<Array<{ id: string; email: string }>>
  insertDocuments(rows: Record<string, unknown>[]): Promise<void>
  insertDeliveries(rows: Record<string, unknown>[]): Promise<void>
  failEvent(id: string, message: string): Promise<void>
}

export interface CreatedEvent {
  id: string
  created: boolean
  status: EventStatus
  recipients: string[]
}

/**
 * One logical email per key. A second call with the same key returns the first event
 * and creates nothing. Recipients are the active company addresses at this moment;
 * someone added later receives later emails, not this one.
 */
export async function createEmailEvent(db: EventDb, input: NewEvent): Promise<CreatedEvent> {
  const existing = await db.findEventByKey(input.key)
  if (existing) return { id: existing.id, created: false, status: existing.status, recipients: [] }

  const active = await db.activeRecipients()
  const recipients = input.onlyTo?.length
    ? input.onlyTo.map((email) => active.find((item) => item.email.toLowerCase() === email.toLowerCase()) || { id: null, email })
    : active
  const status: EventStatus = recipients.length ? 'queued' : 'awaiting_recipients'
  const inserted = await db.insertEvent({
    event_type: input.type,
    event_reference: input.reference,
    idempotency_key: input.key,
    subject: input.subject,
    status,
    document_count: input.selections.length,
    payload: { template: { ...input.template, omitted: input.omitted?.length ? input.omitted : input.template.omitted }, ...(input.extra || {}) },
    created_by: input.createdBy || null,
    resend_of: input.resendOf || null,
  })
  if (inserted === 'duplicate') {
    const raced = await db.findEventByKey(input.key)
    return { id: raced?.id || '', created: false, status: raced?.status || 'queued', recipients: [] }
  }
  try {
    if (input.selections.length) {
      await db.insertDocuments(
        input.selections.map((item, index) => ({
          event_id: inserted.id,
          document_type: item.document_type,
          booking_id: item.booking_id,
          document_id: item.document_id,
          folder: item.folder,
          sort_order: index,
        }))
      )
    }
    if (recipients.length) {
      await db.insertDeliveries(recipients.map((item) => ({ event_id: inserted.id, recipient_id: item.id, recipient_email: item.email })))
    }
  } catch (error) {
    await db.failEvent(inserted.id, error instanceof Error ? error.message : 'Could not record the email')
    throw error
  }
  return { id: inserted.id, created: true, status, recipients: recipients.map((item) => item.email) }
}
