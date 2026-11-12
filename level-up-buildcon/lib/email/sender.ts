import { Resend } from 'resend'
import { emailConfig } from './config'
import type { ProviderError } from './core'

export interface OutgoingAttachment {
  filename: string
  content: Buffer
}

export interface OutgoingEmail {
  from: string
  to: string
  subject: string
  html: string
  text: string
  attachments: OutgoingAttachment[]
  tags?: Array<{ name: string; value: string }>
}

export type SendResult = { ok: true; id: string } | { ok: false; error: ProviderError }

export interface EmailSender {
  send(email: OutgoingEmail, idempotencyKey: string): Promise<SendResult>
}

class ResendSender implements EmailSender {
  private client: Resend
  constructor(apiKey: string) {
    this.client = new Resend(apiKey)
  }
  async send(email: OutgoingEmail, idempotencyKey: string): Promise<SendResult> {
    try {
      const { data, error } = await this.client.emails.send(
        {
          from: email.from,
          to: [email.to],
          subject: email.subject,
          html: email.html,
          text: email.text,
          attachments: email.attachments.map((file) => ({ filename: file.filename, content: file.content })),
          tags: email.tags,
        },
        { idempotencyKey }
      )
      if (error || !data) return { ok: false, error: { name: error?.name, statusCode: error?.statusCode, message: error?.message || 'Resend did not return a message id' } }
      return { ok: true, id: data.id }
    } catch (error) {
      return { ok: false, error: { name: 'application_error', statusCode: null, message: error instanceof Error ? error.message : 'Network error' } }
    }
  }
}

/** Records messages instead of sending them. Used by tests and EMAIL_SENDER=mock. */
export class MockSender implements EmailSender {
  sent: Array<OutgoingEmail & { idempotencyKey: string; id: string }> = []
  private seen = new Map<string, string>()
  failFor = new Set<string>()
  failWith: ProviderError = { name: 'application_error', statusCode: 500, message: 'Mock failure' }
  async send(email: OutgoingEmail, idempotencyKey: string): Promise<SendResult> {
    const known = this.seen.get(idempotencyKey)
    if (known) return { ok: true, id: known }
    if (this.failFor.has(email.to)) return { ok: false, error: this.failWith }
    const id = `mock_${this.sent.length + 1}`
    this.seen.set(idempotencyKey, id)
    this.sent.push({ ...email, idempotencyKey, id })
    return { ok: true, id }
  }
}

let mock: MockSender | null = null

export function defaultSender(): EmailSender {
  const config = emailConfig()
  if (config.sender === 'mock') {
    mock ||= new MockSender()
    return mock
  }
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error('RESEND_API_KEY is not set')
  return new ResendSender(key)
}
