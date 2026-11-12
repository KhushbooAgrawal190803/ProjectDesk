import { randomUUID } from 'crypto'
import { zipFiles } from '@/lib/downloads/zip'
import { signPackageLink } from './config'
import {
  LIMITS,
  aggregateStatus,
  backoffMs,
  choosePackaging,
  classifyError,
  isDue,
  istWindows,
  quotaBlock,
  slug,
  type DeliveryMode,
  type DeliveryStatus,
  type DocumentType,
  type EventStatus,
  type EventType,
} from './core'
import type { EmailSender } from './sender'
import { renderEmail, type TemplateData } from './templates'

export interface EventRow {
  id: string
  event_type: EventType
  event_reference: string | null
  idempotency_key: string
  subject: string
  status: EventStatus
  document_count: number
  payload: { template?: TemplateData; [key: string]: unknown }
  delivery_mode: DeliveryMode | null
  package_path: string | null
  package_bytes: number | null
  package_expires_at: string | null
  package_built_at: string | null
  last_error: string | null
  claim_token: string | null
  next_attempt_at: string | null
  created_at: string
  completed_at: string | null
}

export interface DocumentRow {
  id: string
  event_id: string
  document_type: DocumentType
  booking_id: string | null
  document_id: string | null
  folder: string | null
  file_name: string | null
  storage_path: string | null
  file_bytes: number | null
  sort_order: number
}

export interface DeliveryRow {
  id: string
  event_id: string
  recipient_email: string
  status: DeliveryStatus
  provider_message_id: string | null
  attempt_count: number
  last_error: string | null
  next_attempt_at: string | null
  sent_at: string | null
}

export interface AttemptRow {
  delivery_id: string
  attempt_number: number
  outcome: 'accepted' | 'failed' | 'retry_scheduled' | 'quota_deferred'
  provider_message_id?: string | null
  error?: string | null
}

export interface EmailStore {
  claimEvent(eventId: string, token: string): Promise<EventRow | null>
  claimDueEvents(limit: number, token: string): Promise<EventRow[]>
  documents(eventId: string): Promise<DocumentRow[]>
  saveDocument(id: string, patch: Partial<DocumentRow>): Promise<void>
  /** Only applies while this worker still holds the claim. */
  saveEvent(id: string, token: string, patch: Partial<EventRow>): Promise<boolean>
  deliveries(eventId: string): Promise<DeliveryRow[]>
  saveDelivery(id: string, patch: Partial<DeliveryRow>): Promise<void>
  addAttempt(attempt: AttemptRow): Promise<void>
  sentCounts(dayStart: Date, monthStart: Date): Promise<{ today: number; month: number }>
  putFile(path: string, buffer: Buffer, contentType: string): Promise<void>
  getFile(path: string): Promise<Buffer>
}

export interface DocumentRenderer {
  render(doc: DocumentRow): Promise<{ buffer: Buffer; fileName: string; folder: string }>
}

export interface WorkerDeps {
  store: EmailStore
  renderer: DocumentRenderer
  sender: EmailSender
  from: string
  dailyLimit: number
  monthlyLimit: number
  paused?: boolean
  now?: () => Date
  sleep?: (ms: number) => Promise<void>
  linkFor?: (eventId: string, expiresAt: Date) => string
}

const PACKAGE_FAILURE_LIMIT = 5

function fileKey(eventId: string, folder: string, fileName: string) {
  return `email-events/${eventId}/${slug(folder)}/${fileName}`
}

/** Render every document once and decide how the package is sent. Retries reuse the stored files. */
async function buildPackage(deps: WorkerDeps, event: EventRow, token: string): Promise<EventRow> {
  const now = deps.now?.() ?? new Date()
  const docs = await deps.store.documents(event.id)
  const files: Array<{ name: string; buffer: Buffer }> = []
  for (const doc of docs) {
    if (doc.storage_path) {
      files.push({ name: `${doc.folder || 'Documents'}/${doc.file_name}`, buffer: await deps.store.getFile(doc.storage_path) })
      continue
    }
    const rendered = await deps.renderer.render(doc)
    const path = fileKey(event.id, rendered.folder, rendered.fileName)
    await deps.store.putFile(path, rendered.buffer, rendered.fileName.endsWith('.docx') ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/pdf')
    await deps.store.saveDocument(doc.id, { storage_path: path, file_bytes: rendered.buffer.length, file_name: rendered.fileName, folder: rendered.folder })
    files.push({ name: `${rendered.folder}/${rendered.fileName}`, buffer: rendered.buffer })
  }

  let mode = choosePackaging({ fileBytes: files.map((file) => file.buffer.length) })
  let packagePath: string | null = null
  let packageBytes: number | null = null
  if (mode === 'zip' || mode === 'link') {
    const zip = await zipFiles(files)
    mode = choosePackaging({ fileBytes: files.map((file) => file.buffer.length), zipBytes: zip.length })
    packagePath = `email-events/${event.id}/package.zip`
    packageBytes = zip.length
    await deps.store.putFile(packagePath, zip, 'application/zip')
  }
  const patch: Partial<EventRow> = {
    delivery_mode: mode,
    package_path: packagePath,
    package_bytes: packageBytes ?? files.reduce((sum, file) => sum + file.buffer.length, 0),
    package_built_at: now.toISOString(),
    package_expires_at: mode === 'link' ? new Date(now.getTime() + LIMITS.linkValidDays * 86_400_000).toISOString() : null,
    document_count: files.length,
  }
  await deps.store.saveEvent(event.id, token, patch)
  return { ...event, ...patch }
}

async function attachmentsFor(deps: WorkerDeps, event: EventRow) {
  if (event.delivery_mode === 'attachments') {
    const docs = await deps.store.documents(event.id)
    return Promise.all(
      docs.map(async (doc) => ({ filename: doc.file_name || 'document.pdf', content: await deps.store.getFile(doc.storage_path as string) }))
    )
  }
  if (event.delivery_mode === 'zip' && event.package_path) {
    return [{ filename: `ANANDAM_${slug(event.subject.replace(/\|/g, ' '))}.zip`, content: await deps.store.getFile(event.package_path) }]
  }
  return []
}

export async function processEvent(deps: WorkerDeps, claimed: EventRow, token: string): Promise<EventRow> {
  const now = deps.now?.() ?? new Date()
  const sleep = deps.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)))
  let event = claimed

  try {
    if (!event.package_built_at) event = await buildPackage(deps, event, token)
  } catch (error) {
    const failures = Number(event.payload.packageFailures || 0) + 1
    const message = `Documents could not be prepared: ${error instanceof Error ? error.message : 'unknown error'}`
    const final = failures >= PACKAGE_FAILURE_LIMIT
    await deps.store.saveEvent(event.id, token, {
      status: final ? 'failed' : 'queued',
      last_error: message,
      payload: { ...event.payload, packageFailures: failures },
      next_attempt_at: final ? null : new Date(now.getTime() + backoffMs(failures)).toISOString(),
      claim_token: null,
      completed_at: final ? now.toISOString() : null,
    })
    return { ...event, status: final ? 'failed' : 'queued', last_error: message }
  }

  let deliveries = await deps.store.deliveries(event.id)
  if (!deliveries.length) {
    await deps.store.saveEvent(event.id, token, { status: 'awaiting_recipients', claim_token: null })
    return { ...event, status: 'awaiting_recipients' }
  }
  if (deps.paused) {
    await deps.store.saveEvent(event.id, token, {
      status: 'queued',
      next_attempt_at: new Date(now.getTime() + 15 * 60_000).toISOString(),
      last_error: 'Email delivery is paused (EMAIL_DELIVERY_PAUSED=true).',
      claim_token: null,
    })
    return { ...event, status: 'queued' }
  }

  const due = deliveries.filter((delivery) => isDue(delivery, now))
  if (due.length) {
    const expiresAt = event.package_expires_at ? new Date(event.package_expires_at) : null
    const link = event.delivery_mode === 'link' && expiresAt
      ? { url: (deps.linkFor ?? signPackageLink)(event.id, expiresAt), expiresAt }
      : null
    const template = event.payload.template || { heading: event.subject, intro: '', rows: [], documents: [] }
    const body = renderEmail({ type: event.event_type, subject: event.subject, data: template, mode: event.delivery_mode || 'none', link })
    const attachments = await attachmentsFor(deps, event)
    const windows = istWindows(now)
    const counts = await deps.store.sentCounts(windows.dayStart, windows.monthStart)
    const quota = { sentToday: counts.today, sentThisMonth: counts.month, dailyLimit: deps.dailyLimit, monthlyLimit: deps.monthlyLimit }

    for (const [index, delivery] of due.entries()) {
      const blocked = quotaBlock(quota, now)
      if (blocked) {
        await deps.store.saveDelivery(delivery.id, { status: 'queued', next_attempt_at: blocked.retryAt.toISOString(), last_error: blocked.reason })
        await deps.store.addAttempt({ delivery_id: delivery.id, attempt_number: delivery.attempt_count, outcome: 'quota_deferred', error: blocked.reason })
        continue
      }
      // A delivery left in "sending" by a crash is retried with the same key, so Resend does not send it twice.
      const attempt = delivery.status === 'sending' ? Math.max(1, delivery.attempt_count) : delivery.attempt_count + 1
      await deps.store.saveDelivery(delivery.id, { status: 'sending', attempt_count: attempt })
      const result = await deps.sender.send(
        {
          from: deps.from,
          to: delivery.recipient_email,
          subject: event.subject,
          html: body.html,
          text: body.text,
          attachments,
          tags: [{ name: 'event_type', value: event.event_type }],
        },
        `delivery-${delivery.id}-attempt-${attempt}`
      )
      if (result.ok) {
        await deps.store.saveDelivery(delivery.id, {
          status: 'sent',
          provider_message_id: result.id,
          sent_at: now.toISOString(),
          last_error: null,
          next_attempt_at: null,
        })
        await deps.store.addAttempt({ delivery_id: delivery.id, attempt_number: attempt, outcome: 'accepted', provider_message_id: result.id })
        quota.sentToday += 1
        quota.sentThisMonth += 1
      } else {
        const kind = classifyError(result.error)
        const message = result.error.message || 'Sending failed'
        if (kind === 'daily_quota' || kind === 'monthly_quota') {
          const retryAt = kind === 'daily_quota' ? windows.nextDay : windows.nextMonth
          await deps.store.saveDelivery(delivery.id, { status: 'queued', next_attempt_at: retryAt.toISOString(), last_error: message })
          await deps.store.addAttempt({ delivery_id: delivery.id, attempt_number: attempt, outcome: 'quota_deferred', error: message })
          if (kind === 'daily_quota') quota.sentToday = quota.dailyLimit
          else quota.sentThisMonth = quota.monthlyLimit
        } else if ((kind === 'retryable' || kind === 'rate_limited') && attempt < LIMITS.maxAttempts) {
          const wait = kind === 'rate_limited' ? 60_000 : backoffMs(attempt)
          await deps.store.saveDelivery(delivery.id, { status: 'queued', next_attempt_at: new Date(now.getTime() + wait).toISOString(), last_error: message })
          await deps.store.addAttempt({ delivery_id: delivery.id, attempt_number: attempt, outcome: 'retry_scheduled', error: message })
        } else {
          await deps.store.saveDelivery(delivery.id, { status: 'failed', last_error: message, next_attempt_at: null })
          await deps.store.addAttempt({ delivery_id: delivery.id, attempt_number: attempt, outcome: 'failed', error: message })
        }
      }
      if (index < due.length - 1) await sleep(LIMITS.sendSpacingMs)
    }
  }

  deliveries = await deps.store.deliveries(event.id)
  const summary = aggregateStatus(deliveries)
  const done = summary.status !== 'queued'
  const failures = deliveries.filter((delivery) => delivery.status === 'failed' || delivery.status === 'bounced')
  await deps.store.saveEvent(event.id, token, {
    status: summary.status,
    next_attempt_at: summary.nextAttemptAt,
    claim_token: null,
    completed_at: done ? now.toISOString() : null,
    last_error: failures.length ? `${failures.length} recipient${failures.length === 1 ? '' : 's'} failed: ${failures[0].last_error || 'unknown error'}` : null,
  })
  return { ...event, status: summary.status }
}

/** Claim and process events. With ids, only those events; otherwise everything due. */
export async function runQueue(deps: WorkerDeps, options: { eventIds?: string[]; limit?: number } = {}) {
  const token = randomUUID()
  const claimed: EventRow[] = []
  if (options.eventIds?.length) {
    for (const id of options.eventIds) {
      const event = await deps.store.claimEvent(id, token)
      if (event) claimed.push(event)
    }
  } else {
    claimed.push(...(await deps.store.claimDueEvents(options.limit ?? 10, token)))
  }
  const results: EventRow[] = []
  for (const event of claimed) results.push(await processEvent(deps, event, token))
  return results
}
