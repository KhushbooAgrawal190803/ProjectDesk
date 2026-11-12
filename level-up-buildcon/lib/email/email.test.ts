import { describe, expect, it } from 'vitest'
import {
  LIMITS,
  aggregateStatus,
  backoffMs,
  choosePackaging,
  classifyError,
  documentFileName,
  eventKeys,
  istWindows,
  normalizeEmail,
  quotaBlock,
  shortHash,
} from './core'
import { createEmailEvent, type EventDb } from './events'
import { MockSender } from './sender'
import { renderEmail } from './templates'
import { processEvent, runQueue, type DeliveryRow, type DocumentRow, type EmailStore, type EventRow, type WorkerDeps } from './worker'
import type { DocumentSelection } from './documents'

/** One in-memory database for both event creation and the worker. */
class MemoryDb implements EventDb, EmailStore {
  events: EventRow[] = []
  docs: DocumentRow[] = []
  deliveriesRows: DeliveryRow[] = []
  attempts: Array<{ delivery_id: string; outcome: string }> = []
  recipients: Array<{ id: string; email: string; is_active: boolean }> = []
  files = new Map<string, Buffer>()
  private seq = 0
  clock = new Date('2026-11-12T06:00:00Z')
  private id(prefix: string) {
    this.seq += 1
    return `${prefix}-${this.seq}`
  }

  async insertEvent(row: Record<string, unknown>) {
    if (this.events.some((event) => event.idempotency_key === row.idempotency_key)) return 'duplicate' as const
    const event = {
      id: this.id('event'),
      delivery_mode: null,
      package_path: null,
      package_bytes: null,
      package_expires_at: null,
      package_built_at: null,
      last_error: null,
      claim_token: null,
      claimed_at: null,
      next_attempt_at: null,
      created_at: this.clock.toISOString(),
      completed_at: null,
      ...row,
    } as unknown as EventRow & { claimed_at: string | null }
    this.events.push(event)
    return { id: event.id }
  }
  async findEventByKey(key: string) {
    const event = this.events.find((item) => item.idempotency_key === key)
    return event ? { id: event.id, status: event.status } : null
  }
  async activeRecipients() {
    return this.recipients.filter((item) => item.is_active).map(({ id, email }) => ({ id, email }))
  }
  async insertDocuments(rows: Record<string, unknown>[]) {
    for (const row of rows) this.docs.push({ id: this.id('doc'), file_name: null, storage_path: null, file_bytes: null, ...row } as unknown as DocumentRow)
  }
  async insertDeliveries(rows: Record<string, unknown>[]) {
    for (const row of rows) {
      this.deliveriesRows.push({ id: this.id('delivery'), status: 'queued', provider_message_id: null, attempt_count: 0, last_error: null, next_attempt_at: null, sent_at: null, ...row } as unknown as DeliveryRow)
    }
  }
  async failEvent(id: string, message: string) {
    const event = this.events.find((item) => item.id === id)!
    event.status = 'failed'
    event.last_error = message
  }

  private claimable(event: EventRow & { claimed_at?: string | null }) {
    if (event.status === 'queued') return !event.next_attempt_at || new Date(event.next_attempt_at) <= this.clock
    if (event.status === 'processing') return Boolean(event.claimed_at) && new Date(event.claimed_at!).getTime() < this.clock.getTime() - LIMITS.staleClaimSeconds * 1000
    return false
  }
  private take(event: EventRow & { claimed_at?: string | null }, token: string) {
    event.status = 'processing'
    event.claim_token = token
    event.claimed_at = this.clock.toISOString()
    return { ...event }
  }
  async claimEvent(eventId: string, token: string) {
    const event = this.events.find((item) => item.id === eventId)
    return event && this.claimable(event) ? this.take(event, token) : null
  }
  async claimDueEvents(limit: number, token: string) {
    return this.events.filter((event) => this.claimable(event)).slice(0, limit).map((event) => this.take(event, token))
  }
  async documents(eventId: string) {
    return this.docs.filter((doc) => doc.event_id === eventId).sort((a, b) => a.sort_order - b.sort_order)
  }
  async saveDocument(id: string, patch: Partial<DocumentRow>) {
    Object.assign(this.docs.find((doc) => doc.id === id)!, patch)
  }
  async saveEvent(id: string, token: string, patch: Partial<EventRow>) {
    const event = this.events.find((item) => item.id === id)!
    if (event.claim_token !== token) return false
    Object.assign(event, patch)
    return true
  }
  async deliveries(eventId: string) {
    return this.deliveriesRows.filter((item) => item.event_id === eventId).map((item) => ({ ...item }))
  }
  async saveDelivery(id: string, patch: Partial<DeliveryRow>) {
    Object.assign(this.deliveriesRows.find((item) => item.id === id)!, patch)
  }
  async addAttempt(attempt: { delivery_id: string; outcome: string }) {
    this.attempts.push(attempt)
  }
  async sentCounts(dayStart: Date, monthStart: Date) {
    const sent = this.deliveriesRows.filter((item) => item.sent_at)
    return {
      today: sent.filter((item) => new Date(item.sent_at!) >= dayStart).length,
      month: sent.filter((item) => new Date(item.sent_at!) >= monthStart).length,
    }
  }
  async putFile(path: string, buffer: Buffer) {
    this.files.set(path, buffer)
  }
  async getFile(path: string) {
    const file = this.files.get(path)
    if (!file) throw new Error(`missing ${path}`)
    return file
  }
}

function addRecipients(db: MemoryDb, ...emails: string[]) {
  for (const email of emails) db.recipients.push({ id: `r-${email}`, email, is_active: true })
}

function notes(count: number): DocumentSelection[] {
  return Array.from({ length: count }, (_, index) => ({
    document_type: 'demand_note',
    booking_id: `b${index}`,
    document_id: `n${index}`,
    folder: 'Demand Notes/Before casting of Basement slab',
    label: `Note ${index + 1}`,
  }))
}

function deps(db: MemoryDb, sender: MockSender, overrides: Partial<WorkerDeps> & { fileBytes?: number } = {}): WorkerDeps {
  const size = overrides.fileBytes ?? 40_000
  return {
    store: db,
    renderer: {
      async render(doc) {
        return { buffer: Buffer.alloc(size, doc.id), fileName: `${doc.document_id || doc.document_type}.pdf`, folder: doc.folder || 'Documents' }
      },
    },
    sender,
    from: 'Level Up Buildcon <documents@levelupbuildcon.com>',
    dailyLimit: 100,
    monthlyLimit: 3000,
    now: () => db.clock,
    sleep: async () => undefined,
    linkFor: (eventId, expiresAt) => `https://app.example/api/email-packages/${eventId}?expires=${Math.floor(expiresAt.getTime() / 1000)}&sig=test`,
    ...overrides,
  }
}

function event(selections: DocumentSelection[], key = `key-${Math.random()}`) {
  return {
    type: 'milestone_completed' as const,
    reference: 'Basement slab',
    key,
    subject: `ANANDAM | Before casting of Basement slab Completed | ${selections.length} Demand Notes`,
    template: { heading: 'Construction milestone demand notes', intro: 'Due.', rows: [['Milestone', 'Basement slab']] as Array<[string, string]>, documents: selections.map((item) => ({ name: item.label, type: item.document_type })) },
    selections,
  }
}

describe('email rules', () => {
  it('attaches small batches, zips medium ones and links very large ones', () => {
    expect(choosePackaging({ fileBytes: [] })).toBe('none')
    expect(choosePackaging({ fileBytes: [200_000, 200_000, 300_000, 300_000] })).toBe('attachments')
    expect(choosePackaging({ fileBytes: Array(40).fill(200_000) })).toBe('zip')
    expect(choosePackaging({ fileBytes: Array(400).fill(200_000), zipBytes: 70 * 1024 * 1024 })).toBe('link')
  })

  it('classifies Resend errors into retry, quota and permanent failures', () => {
    expect(classifyError({ name: 'rate_limit_exceeded', statusCode: 429, message: 'Too many requests' })).toBe('rate_limited')
    expect(classifyError({ name: 'daily_quota_exceeded', statusCode: 429 })).toBe('daily_quota')
    expect(classifyError({ name: 'monthly_quota_exceeded', statusCode: 429 })).toBe('monthly_quota')
    expect(classifyError({ name: 'application_error', statusCode: 500 })).toBe('retryable')
    expect(classifyError({ name: 'validation_error', statusCode: 422 })).toBe('permanent')
    expect(backoffMs(1)).toBe(60_000)
    expect(backoffMs(9)).toBe(6 * 60 * 60_000)
  })

  it('counts quotas in IST days and months', () => {
    // 20:00 UTC on 30 November is 01:30 IST on 1 December.
    const windows = istWindows(new Date('2026-11-30T20:00:00Z'))
    expect(windows.dayStart.toISOString()).toBe('2026-11-30T18:30:00.000Z')
    expect(windows.monthStart.toISOString()).toBe('2026-11-30T18:30:00.000Z')
    expect(windows.nextMonth.toISOString()).toBe('2026-12-31T18:30:00.000Z')
    expect(quotaBlock({ sentToday: 100, sentThisMonth: 100, dailyLimit: 100, monthlyLimit: 3000 }, new Date())?.reason).toContain('Daily')
    expect(quotaBlock({ sentToday: 5, sentThisMonth: 3000, dailyLimit: 100, monthlyLimit: 3000 }, new Date())?.reason).toContain('Monthly')
    expect(quotaBlock({ sentToday: 5, sentThisMonth: 5, dailyLimit: 100, monthlyLimit: 3000 }, new Date())).toBeNull()
  })

  it('rolls recipients up into one event status', () => {
    expect(aggregateStatus([]).status).toBe('awaiting_recipients')
    expect(aggregateStatus([{ status: 'sent' }, { status: 'delivered' }]).status).toBe('sent')
    expect(aggregateStatus([{ status: 'sent' }, { status: 'failed' }]).status).toBe('partially_failed')
    expect(aggregateStatus([{ status: 'failed' }, { status: 'bounced' }]).status).toBe('failed')
    expect(aggregateStatus([{ status: 'sent' }, { status: 'queued', next_attempt_at: '2026-11-12T07:00:00Z' }])).toEqual({ status: 'queued', nextAttemptAt: '2026-11-12T07:00:00Z' })
  })

  it('builds stable keys and descriptive file names', () => {
    expect(eventKeys.bookingFinalized('abc')).toBe('booking-finalized:abc')
    expect(eventKeys.milestoneCompleted('m1', 2)).toBe('milestone-completed:m1:v2')
    expect(shortHash(['b', 'a'])).toBe(shortHash(['a', 'b']))
    expect(eventKeys.scheduledDate('2026-12-03', ['x'])).not.toBe(eventKeys.scheduledDate('2026-12-03', ['y']))
    expect(documentFileName({ type: 'demand_note', serial: 'LUBC 05', unit: '405', stage: 'Before casting of Basement slab', reference: 'LUB/ANANDAM/DN/405/002/2026' }))
      .toBe('LUBC-05_Flat-405_Demand-Note_Before-casting-of-Basement-slab_LUB-ANANDAM-DN-405-002-2026.pdf')
    expect(normalizeEmail(' Accounts@LevelUpBuildcon.com ')).toBe('accounts@levelupbuildcon.com')
    expect(normalizeEmail('not an email')).toBeNull()
  })

  it('escapes content and explains a secure link', () => {
    const { html, text } = renderEmail({
      type: 'manual_bulk',
      subject: 'x',
      data: { heading: 'A <b>', intro: 'i', rows: [['Flat', '405 & co']], documents: [{ name: 'Note', type: 'demand_note' }], omitted: [{ name: 'NOC', reason: 'Bank address missing' }] },
      mode: 'link',
      link: { url: 'https://app.example/x', expiresAt: new Date('2026-11-19T00:00:00Z') },
    })
    expect(html).toContain('A &lt;b&gt;')
    expect(html).toContain('405 &amp; co')
    expect(html).toContain('LEVEL UP BUILDCON')
    expect(html).toContain('Project: ANANDAM')
    expect(text).toContain('secure download link')
    expect(text).toContain('NOC: Bank address missing')
  })
})

describe('email delivery', () => {
  it('sends one consolidated booking email to a single recipient', async () => {
    const db = new MemoryDb()
    const sender = new MockSender()
    addRecipients(db, 'accounts@levelupbuildcon.com')
    const created = await createEmailEvent(db, event(notes(3)))
    await runQueue(deps(db, sender), { eventIds: [created.id] })
    expect(sender.sent).toHaveLength(1)
    expect(sender.sent[0].attachments).toHaveLength(3)
    expect(db.events[0].status).toBe('sent')
  })

  it('gives every active recipient the same package, and skips disabled ones', async () => {
    const db = new MemoryDb()
    const sender = new MockSender()
    addRecipients(db, 'a@levelupbuildcon.com', 'b@levelupbuildcon.com', 'c@levelupbuildcon.com')
    db.recipients.push({ id: 'r-off', email: 'off@levelupbuildcon.com', is_active: false })
    const created = await createEmailEvent(db, event(notes(2)))
    await runQueue(deps(db, sender), { eventIds: [created.id] })
    expect(sender.sent.map((item) => item.to).sort()).toEqual(['a@levelupbuildcon.com', 'b@levelupbuildcon.com', 'c@levelupbuildcon.com'])
    expect(new Set(sender.sent.map((item) => item.attachments.map((file) => file.filename).join()))).toHaveProperty('size', 1)
  })

  it('sends 40 demand notes as one email with one ZIP, not 40 emails', async () => {
    const db = new MemoryDb()
    const sender = new MockSender()
    addRecipients(db, 'a@levelupbuildcon.com')
    const created = await createEmailEvent(db, event(notes(40)))
    await runQueue(deps(db, sender), { eventIds: [created.id] })
    expect(sender.sent).toHaveLength(1)
    expect(sender.sent[0].attachments).toHaveLength(1)
    expect(sender.sent[0].attachments[0].filename).toMatch(/\.zip$/)
    expect(db.events[0].delivery_mode).toBe('zip')
    expect(db.events[0].document_count).toBe(40)
  })

  it('uses a secure expiring link when the ZIP is too large to attach', async () => {
    const db = new MemoryDb()
    const sender = new MockSender()
    addRecipients(db, 'a@levelupbuildcon.com')
    const created = await createEmailEvent(db, event(notes(30)))
    // Random bytes do not compress, so the ZIP stays above the attachment limit.
    const big = deps(db, sender)
    big.renderer = { async render(doc) { return { buffer: Buffer.from(Array.from({ length: 1_000_000 }, () => Math.floor(Math.random() * 256))), fileName: `${doc.document_id}.pdf`, folder: 'Demand Notes' } } }
    await runQueue(big, { eventIds: [created.id] })
    expect(db.events[0].delivery_mode).toBe('link')
    expect(sender.sent[0].attachments).toHaveLength(0)
    expect(sender.sent[0].html).toContain('Download documents (ZIP)')
    expect(db.events[0].package_expires_at).toBeTruthy()
  })

  it('keeps an event Awaiting Recipients when nobody is configured, and sends nothing', async () => {
    const db = new MemoryDb()
    const sender = new MockSender()
    const created = await createEmailEvent(db, event(notes(2)))
    expect(created.status).toBe('awaiting_recipients')
    await runQueue(deps(db, sender))
    expect(sender.sent).toHaveLength(0)
    expect(db.events[0].status).toBe('awaiting_recipients')
  })

  it('retries only the failing recipient, never re-sending the ones that succeeded', async () => {
    const db = new MemoryDb()
    const sender = new MockSender()
    addRecipients(db, 'ok@levelupbuildcon.com', 'bad@levelupbuildcon.com')
    sender.failFor.add('bad@levelupbuildcon.com')
    const created = await createEmailEvent(db, event(notes(1)))
    const worker = deps(db, sender)
    await runQueue(worker, { eventIds: [created.id] })
    expect(db.events[0].status).toBe('queued')
    for (let attempt = 0; attempt < LIMITS.maxAttempts; attempt += 1) {
      db.clock = new Date(db.clock.getTime() + 7 * 60 * 60_000)
      await runQueue(worker)
    }
    expect(sender.sent.filter((item) => item.to === 'ok@levelupbuildcon.com')).toHaveLength(1)
    expect(db.deliveriesRows.find((item) => item.recipient_email === 'bad@levelupbuildcon.com')?.status).toBe('failed')
    expect(db.deliveriesRows.find((item) => item.recipient_email === 'bad@levelupbuildcon.com')?.attempt_count).toBe(LIMITS.maxAttempts)
    expect(db.events[0].status).toBe('partially_failed')
  })

  it('does not send twice when two scheduler runs overlap', async () => {
    const db = new MemoryDb()
    const sender = new MockSender()
    addRecipients(db, 'a@levelupbuildcon.com')
    await createEmailEvent(db, event(notes(1)))
    const worker = deps(db, sender)
    await Promise.all([runQueue(worker), runQueue(worker)])
    expect(sender.sent).toHaveLength(1)
  })

  it('recovers after a restart mid-send without a duplicate email', async () => {
    const db = new MemoryDb()
    const sender = new MockSender()
    addRecipients(db, 'a@levelupbuildcon.com')
    const created = await createEmailEvent(db, event(notes(1)))
    const worker = deps(db, sender)
    // The first worker sends, then dies before recording the result.
    const claimed = (await db.claimEvent(created.id, 'dead-worker'))!
    const delivery = db.deliveriesRows[0]
    delivery.status = 'sending'
    delivery.attempt_count = 1
    await sender.send({ from: '', to: delivery.recipient_email, subject: '', html: '', text: '', attachments: [] }, `delivery-${delivery.id}-attempt-1`)
    expect(claimed.status).toBe('processing')
    // Too early: the dead worker's claim is still held.
    expect(await runQueue(worker)).toHaveLength(0)
    db.clock = new Date(db.clock.getTime() + (LIMITS.staleClaimSeconds + 60) * 1000)
    await runQueue(worker)
    expect(sender.sent).toHaveLength(1)
    expect(db.deliveriesRows[0].status).toBe('sent')
    expect(db.events[0].status).toBe('sent')
  })

  it('creates an automatic event once per key, however often reconciliation runs', async () => {
    const db = new MemoryDb()
    addRecipients(db, 'a@levelupbuildcon.com')
    const first = await createEmailEvent(db, event(notes(2), 'milestone-completed:m1:v0'))
    const again = await createEmailEvent(db, event(notes(2), 'milestone-completed:m1:v0'))
    expect(first.created).toBe(true)
    expect(again.created).toBe(false)
    expect(again.id).toBe(first.id)
    expect(db.events).toHaveLength(1)
    expect(db.deliveriesRows).toHaveLength(1)
  })

  it('sends a newly added recipient future emails only', async () => {
    const db = new MemoryDb()
    const sender = new MockSender()
    addRecipients(db, 'first@levelupbuildcon.com')
    const before = await createEmailEvent(db, event(notes(1)))
    addRecipients(db, 'new@levelupbuildcon.com')
    const after = await createEmailEvent(db, event(notes(1)))
    await runQueue(deps(db, sender), { eventIds: [before.id, after.id] })
    expect(sender.sent.filter((item) => item.to === 'new@levelupbuildcon.com')).toHaveLength(1)
    expect(sender.sent.filter((item) => item.to === 'first@levelupbuildcon.com')).toHaveLength(2)
  })

  it('defers when the daily quota is used up, then resumes after midnight IST', async () => {
    const db = new MemoryDb()
    const sender = new MockSender()
    addRecipients(db, 'a@levelupbuildcon.com', 'b@levelupbuildcon.com')
    const created = await createEmailEvent(db, event(notes(1)))
    const worker = deps(db, sender, { dailyLimit: 1 })
    await runQueue(worker, { eventIds: [created.id] })
    expect(sender.sent).toHaveLength(1)
    expect(db.events[0].status).toBe('queued')
    expect(db.attempts.some((item) => item.outcome === 'quota_deferred')).toBe(true)
    db.clock = istWindows(db.clock).nextDay
    await runQueue(worker)
    expect(sender.sent).toHaveLength(2)
    expect(db.events[0].status).toBe('sent')
  })

  it('reuses the stored files on retry instead of regenerating documents', async () => {
    const db = new MemoryDb()
    const sender = new MockSender()
    addRecipients(db, 'a@levelupbuildcon.com')
    let renders = 0
    const worker = deps(db, sender)
    worker.renderer = { async render(doc) { renders += 1; return { buffer: Buffer.from('pdf'), fileName: `${doc.document_id}.pdf`, folder: 'Demand Notes' } } }
    sender.failFor.add('a@levelupbuildcon.com')
    const created = await createEmailEvent(db, event(notes(2)))
    await runQueue(worker, { eventIds: [created.id] })
    sender.failFor.clear()
    db.clock = new Date(db.clock.getTime() + 2 * 60_000)
    await runQueue(worker)
    expect(renders).toBe(2)
    expect(sender.sent).toHaveLength(1)
    expect(sender.sent[0].attachments.map((file) => file.filename)).toEqual(['n0.pdf', 'n1.pdf'])
  })

  it('marks the event for retry when a document cannot be prepared, without sending a partial package', async () => {
    const db = new MemoryDb()
    const sender = new MockSender()
    addRecipients(db, 'a@levelupbuildcon.com')
    const created = await createEmailEvent(db, event(notes(2)))
    const worker = deps(db, sender)
    worker.renderer = { async render() { throw new Error('Booking not found') } }
    const claimed = (await db.claimEvent(created.id, 't'))!
    await processEvent(worker, claimed, 't')
    expect(sender.sent).toHaveLength(0)
    expect(db.events[0].status).toBe('queued')
    expect(db.events[0].last_error).toContain('Booking not found')
  })
})
