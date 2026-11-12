import type { SupabaseClient } from '@supabase/supabase-js'
import { configProblems, emailConfig } from './config'
import { istWindows } from './core'
import { emailTablesReady } from './service'

export interface RecipientRow {
  id: string
  email: string
  label: string | null
  is_active: boolean
  created_at: string
}

/** Everything the Email Delivery section shows. Read with the service client after an admin check. */
export async function loadEmailOverview(service: SupabaseClient) {
  const config = emailConfig()
  const tablesReady = await emailTablesReady(service)
  if (!tablesReady) {
    return { config, problems: configProblems(config), tablesReady, recipients: [] as RecipientRow[], awaiting: 0, failing: 0, sentToday: 0, sentThisMonth: 0 }
  }
  const windows = istWindows(new Date())
  const [recipients, awaiting, failing, today, month] = await Promise.all([
    service.from('company_email_recipients').select('id, email, label, is_active, created_at').order('email'),
    service.from('email_events').select('id', { count: 'exact', head: true }).eq('status', 'awaiting_recipients'),
    service.from('email_events').select('id', { count: 'exact', head: true }).in('status', ['failed', 'partially_failed']),
    service.from('email_deliveries').select('id', { count: 'exact', head: true }).gte('sent_at', windows.dayStart.toISOString()),
    service.from('email_deliveries').select('id', { count: 'exact', head: true }).gte('sent_at', windows.monthStart.toISOString()),
  ])
  return {
    config,
    problems: configProblems(config),
    tablesReady,
    recipients: (recipients.data || []) as RecipientRow[],
    awaiting: awaiting.count || 0,
    failing: failing.count || 0,
    sentToday: today.count || 0,
    sentThisMonth: month.count || 0,
  }
}

export async function loadEmailHistory(service: SupabaseClient, limit = 100) {
  if (!(await emailTablesReady(service))) return []
  const { data: events } = await service
    .from('email_events')
    .select('id, event_type, event_reference, subject, status, document_count, delivery_mode, created_at, completed_at, last_error')
    .order('created_at', { ascending: false })
    .limit(limit)
  const ids = (events || []).map((event) => event.id as string)
  const { data: deliveries } = ids.length
    ? await service.from('email_deliveries').select('event_id, recipient_email, status').in('event_id', ids)
    : { data: [] }
  return (events || []).map((event) => ({
    ...event,
    deliveries: (deliveries || []).filter((delivery) => delivery.event_id === event.id),
  }))
}

export async function loadEmailEvent(service: SupabaseClient, eventId: string) {
  const { data: event } = await service.from('email_events').select('*').eq('id', eventId).maybeSingle()
  if (!event) return null
  const [documents, deliveries] = await Promise.all([
    service.from('email_event_documents').select('*').eq('event_id', eventId).order('sort_order'),
    service.from('email_deliveries').select('*').eq('event_id', eventId).order('recipient_email'),
  ])
  const deliveryIds = (deliveries.data || []).map((row) => row.id as string)
  const { data: attempts } = deliveryIds.length
    ? await service.from('email_delivery_attempts').select('*').in('delivery_id', deliveryIds).order('attempted_at')
    : { data: [] }
  return { event, documents: documents.data || [], deliveries: deliveries.data || [], attempts: attempts || [] }
}
