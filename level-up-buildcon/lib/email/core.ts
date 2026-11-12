/**
 * Pure rules for email delivery: how a document package is sent, when a failed
 * delivery is retried, how quotas are counted, and what an event's overall status is.
 * No database or network access, so every rule is unit-tested.
 */

export type EventType =
  | 'booking_finalized'
  | 'agreement_finalized'
  | 'milestone_completed'
  | 'scheduled_date'
  | 'manual_bulk'
  | 'test'
  | 'resend'

export type EventStatus = 'awaiting_recipients' | 'queued' | 'processing' | 'sent' | 'partially_failed' | 'failed'

export type DeliveryStatus = 'queued' | 'sending' | 'sent' | 'delivered' | 'delivery_delayed' | 'bounced' | 'complained' | 'failed'

export type DeliveryMode = 'none' | 'attachments' | 'zip' | 'link'

export type DocumentType = 'allotment' | 'noc' | 'agreement' | 'demand_note'

/** Automatic events. A demand note in one of these has already been emailed automatically. */
export const AUTOMATIC_EVENT_TYPES: EventType[] = ['booking_finalized', 'milestone_completed', 'scheduled_date']

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  booking_finalized: 'New booking',
  agreement_finalized: 'Agreement finalized',
  milestone_completed: 'Milestone completed',
  scheduled_date: 'Scheduled date',
  manual_bulk: 'Manual send',
  test: 'Test email',
  resend: 'Resend',
}

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  awaiting_recipients: 'Awaiting Recipients',
  queued: 'Queued',
  processing: 'Processing',
  sent: 'Sent',
  partially_failed: 'Partially Failed',
  failed: 'Failed',
}

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  queued: 'Queued',
  sending: 'Sending',
  sent: 'Accepted by Resend',
  delivered: 'Delivered',
  delivery_delayed: 'Delivery delayed',
  bounced: 'Bounced',
  complained: 'Marked as spam',
  failed: 'Failed',
}

/** Resend accepts at most 40 MB per email after base64, which grows files by a third. */
export const LIMITS = {
  attachmentFiles: 10,
  attachmentBytes: 15 * 1024 * 1024,
  zipBytes: 25 * 1024 * 1024,
  maxAttempts: 5,
  staleClaimSeconds: 10 * 60,
  sendSpacingMs: 600,
  linkValidDays: 7,
}

export function choosePackaging(input: { fileBytes: number[]; zipBytes?: number | null }): DeliveryMode {
  const count = input.fileBytes.length
  if (count === 0) return 'none'
  const total = input.fileBytes.reduce((sum, bytes) => sum + bytes, 0)
  if (count <= LIMITS.attachmentFiles && total <= LIMITS.attachmentBytes) return 'attachments'
  const zip = input.zipBytes ?? total
  if (zip <= LIMITS.zipBytes) return 'zip'
  return 'link'
}

/** 1 minute, 5 minutes, 15 minutes, 1 hour, 6 hours. */
export function backoffMs(attempt: number): number {
  const steps = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 6 * 60 * 60_000]
  return steps[Math.min(Math.max(attempt, 1), steps.length) - 1]
}

export interface ProviderError {
  name?: string | null
  statusCode?: number | null
  message?: string | null
}

export type ErrorKind = 'rate_limited' | 'daily_quota' | 'monthly_quota' | 'retryable' | 'permanent'

export function classifyError(error: ProviderError): ErrorKind {
  const name = error.name || ''
  if (name === 'daily_quota_exceeded') return 'daily_quota'
  if (name === 'monthly_quota_exceeded') return 'monthly_quota'
  if (name === 'rate_limit_exceeded' || error.statusCode === 429) {
    if (/daily/i.test(error.message || '')) return 'daily_quota'
    if (/monthly/i.test(error.message || '')) return 'monthly_quota'
    return 'rate_limited'
  }
  if (['application_error', 'internal_server_error', 'concurrent_idempotent_requests'].includes(name)) return 'retryable'
  if (error.statusCode == null || error.statusCode >= 500) return 'retryable'
  return 'permanent'
}

const IST_OFFSET_MS = (5 * 60 + 30) * 60_000

/** Start of the current IST day and month, as UTC instants, for quota counting. */
export function istWindows(now: Date): { dayStart: Date; monthStart: Date; nextDay: Date; nextMonth: Date } {
  const local = new Date(now.getTime() + IST_OFFSET_MS)
  const y = local.getUTCFullYear()
  const m = local.getUTCMonth()
  const d = local.getUTCDate()
  const toUtc = (year: number, month: number, day: number) => new Date(Date.UTC(year, month, day) - IST_OFFSET_MS)
  return { dayStart: toUtc(y, m, d), monthStart: toUtc(y, m, 1), nextDay: toUtc(y, m, d + 1), nextMonth: toUtc(y, m + 1, 1) }
}

export interface QuotaState {
  sentToday: number
  sentThisMonth: number
  dailyLimit: number
  monthlyLimit: number
}

/** Null when a message may be sent now, otherwise when to try again. */
export function quotaBlock(quota: QuotaState, now: Date): { reason: string; retryAt: Date } | null {
  const windows = istWindows(now)
  if (quota.sentThisMonth >= quota.monthlyLimit) {
    return { reason: `Monthly email limit of ${quota.monthlyLimit} reached. Sending resumes next month.`, retryAt: windows.nextMonth }
  }
  if (quota.sentToday >= quota.dailyLimit) {
    return { reason: `Daily email limit of ${quota.dailyLimit} reached. Sending resumes after midnight IST.`, retryAt: windows.nextDay }
  }
  return null
}

export interface DeliveryLike {
  status: DeliveryStatus
  next_attempt_at?: string | null
}

const DONE_OK: DeliveryStatus[] = ['sent', 'delivered', 'delivery_delayed']
const DONE_BAD: DeliveryStatus[] = ['failed', 'bounced', 'complained']

/** The event's status from its recipients. Pending retries keep the event queued. */
export function aggregateStatus(deliveries: DeliveryLike[]): { status: EventStatus; nextAttemptAt: string | null } {
  if (!deliveries.length) return { status: 'awaiting_recipients', nextAttemptAt: null }
  const pending = deliveries.filter((item) => item.status === 'queued' || item.status === 'sending')
  if (pending.length) {
    const times = pending.map((item) => item.next_attempt_at).filter(Boolean) as string[]
    const next = times.length === pending.length ? times.sort()[0] : null
    return { status: 'queued', nextAttemptAt: next }
  }
  const ok = deliveries.filter((item) => DONE_OK.includes(item.status)).length
  const bad = deliveries.filter((item) => DONE_BAD.includes(item.status)).length
  if (bad === 0) return { status: 'sent', nextAttemptAt: null }
  if (ok === 0) return { status: 'failed', nextAttemptAt: null }
  return { status: 'partially_failed', nextAttemptAt: null }
}

/** A delivery the worker should attempt now. Successful ones are never sent again. */
export function isDue(delivery: DeliveryLike, now: Date): boolean {
  if (delivery.status !== 'queued' && delivery.status !== 'sending') return false
  return !delivery.next_attempt_at || new Date(delivery.next_attempt_at) <= now
}

export function slug(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[^\w\s.-]/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80) || 'Document'
}

const TYPE_NAMES: Record<DocumentType, string> = {
  allotment: 'Allotment-Letter',
  noc: 'Bank-NOC',
  agreement: 'Agreement-for-Sale',
  demand_note: 'Demand-Note',
}

/** LUBC-05_Flat-405_Demand-Note_Basement-slab_LUB-ANANDAM-DN-405-002-2026.pdf */
export function documentFileName(input: { type: DocumentType; serial?: string | null; unit?: string | null; stage?: string | null; reference?: string | null; version?: number | null; extension?: string }): string {
  const parts = [
    input.serial ? slug(input.serial) : null,
    input.unit ? `Flat-${slug(input.unit)}` : null,
    TYPE_NAMES[input.type],
    input.stage ? slug(input.stage) : null,
    input.reference ? slug(input.reference.replace(/\//g, '-')) : null,
    input.version ? `v${input.version}` : null,
  ].filter(Boolean)
  return `${parts.join('_')}.${input.extension || 'pdf'}`
}

export const FOLDERS: Record<DocumentType, string> = {
  allotment: 'Allotment Letters',
  noc: 'Bank NOCs',
  agreement: 'Agreements for Sale',
  demand_note: 'Demand Notes',
}

/** Stable event keys. Automatic events with the same key are created once. */
export const eventKeys = {
  bookingFinalized: (bookingId: string) => `booking-finalized:${bookingId}`,
  milestoneCompleted: (milestoneId: string, version: number) => `milestone-completed:${milestoneId}:v${version}`,
  milestoneCatchUp: (milestoneId: string, noteIds: string[]) => `milestone-catch-up:${milestoneId}:${shortHash(noteIds)}`,
  scheduledDate: (date: string, noteIds: string[]) => `scheduled-date:${date}:${shortHash(noteIds)}`,
}

/** Order-independent FNV-1a hash of the note ids in a batch. */
export function shortHash(ids: string[]): string {
  let hash = 0x811c9dc5
  for (const char of [...ids].sort().join('|')) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

export function normalizeEmail(value: string): string | null {
  const email = value.trim().toLowerCase()
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null
}
