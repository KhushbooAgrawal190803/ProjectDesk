import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createServiceClient } from '@/lib/supabase/server'
import { aggregateStatus, type DeliveryStatus } from '@/lib/email/core'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const STATUS_BY_TYPE: Record<string, DeliveryStatus> = {
  'email.delivered': 'delivered',
  'email.delivery_delayed': 'delivery_delayed',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
  'email.failed': 'failed',
}

/** Resend delivery events. Only signed requests are accepted (RESEND_WEBHOOK_SECRET). */
export async function POST(request: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: 'Webhook is not configured' }, { status: 503 })
  const payload = await request.text()
  let event: { type: string; created_at: string; data: { email_id?: string; bounce?: { message?: string }; failed?: { reason?: string } } }
  try {
    event = new Resend(process.env.RESEND_API_KEY || 're_unused').webhooks.verify({
      payload,
      headers: {
        id: request.headers.get('svix-id') || '',
        timestamp: request.headers.get('svix-timestamp') || '',
        signature: request.headers.get('svix-signature') || '',
      },
      webhookSecret: secret,
    }) as typeof event
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const status = STATUS_BY_TYPE[event.type]
  const messageId = event.data?.email_id
  if (!status || !messageId) return NextResponse.json({ ok: true, ignored: event.type })

  const service = await createServiceClient()
  const { data: delivery } = await service.from('email_deliveries').select('id, event_id, status').eq('provider_message_id', messageId).maybeSingle()
  if (!delivery) return NextResponse.json({ ok: true, unknown: true })
  // A final state is not undone by a late "delayed" notice.
  if (status === 'delivery_delayed' && ['delivered', 'bounced', 'complained', 'failed'].includes(delivery.status)) {
    return NextResponse.json({ ok: true })
  }
  const reason = event.data.bounce?.message || event.data.failed?.reason || null
  await service
    .from('email_deliveries')
    .update({
      status,
      delivered_at: status === 'delivered' ? event.created_at : null,
      last_error: status === 'delivered' || status === 'delivery_delayed' ? null : reason || event.type,
      updated_at: new Date().toISOString(),
    })
    .eq('id', delivery.id)

  const { data: deliveries } = await service.from('email_deliveries').select('status, next_attempt_at').eq('event_id', delivery.event_id)
  const summary = aggregateStatus((deliveries || []) as Array<{ status: DeliveryStatus; next_attempt_at: string | null }>)
  if (summary.status !== 'queued') {
    await service.from('email_events').update({ status: summary.status, updated_at: new Date().toISOString() }).eq('id', delivery.event_id).neq('status', 'processing')
  }
  return NextResponse.json({ ok: true })
}
