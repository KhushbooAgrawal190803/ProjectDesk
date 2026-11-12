import type { SupabaseClient } from '@supabase/supabase-js'
import { LIMITS } from './core'
import type { AttemptRow, DeliveryRow, DocumentRow, EmailStore, EventRow } from './worker'

export const EMAIL_BUCKET = 'booking-documents'

function must<T>(result: { data: T; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`)
  return result.data
}

/** Email tables are service-role only. Callers check the user's role before using this. */
export function supabaseEmailStore(service: SupabaseClient): EmailStore {
  const now = () => new Date().toISOString()
  return {
    async claimEvent(eventId, token) {
      const rows = must(await service.rpc('claim_email_event', { p_event_id: eventId, p_token: token, p_stale_seconds: LIMITS.staleClaimSeconds }), 'claim event')
      return ((rows as EventRow[]) || [])[0] || null
    },
    async claimDueEvents(limit, token) {
      const rows = must(await service.rpc('claim_email_events', { p_limit: limit, p_token: token, p_stale_seconds: LIMITS.staleClaimSeconds }), 'claim events')
      return (rows as EventRow[]) || []
    },
    async documents(eventId) {
      return must(await service.from('email_event_documents').select('*').eq('event_id', eventId).order('sort_order'), 'documents') as DocumentRow[]
    },
    async saveDocument(id, patch) {
      must(await service.from('email_event_documents').update(patch).eq('id', id), 'save document')
    },
    async saveEvent(id, token, patch) {
      const { data, error } = await service
        .from('email_events')
        .update({ ...patch, updated_at: now() })
        .eq('id', id)
        .eq('claim_token', token)
        .select('id')
      if (error) throw new Error(`save event: ${error.message}`)
      return Boolean(data?.length)
    },
    async deliveries(eventId) {
      return must(await service.from('email_deliveries').select('*').eq('event_id', eventId).order('recipient_email'), 'deliveries') as DeliveryRow[]
    },
    async saveDelivery(id, patch) {
      must(await service.from('email_deliveries').update({ ...patch, updated_at: now() }).eq('id', id), 'save delivery')
    },
    async addAttempt(attempt: AttemptRow) {
      must(await service.from('email_delivery_attempts').insert(attempt), 'record attempt')
    },
    async sentCounts(dayStart, monthStart) {
      const [today, month] = await Promise.all([
        service.from('email_deliveries').select('id', { count: 'exact', head: true }).gte('sent_at', dayStart.toISOString()),
        service.from('email_deliveries').select('id', { count: 'exact', head: true }).gte('sent_at', monthStart.toISOString()),
      ])
      if (today.error) throw new Error(today.error.message)
      if (month.error) throw new Error(month.error.message)
      return { today: today.count || 0, month: month.count || 0 }
    },
    async putFile(path, buffer, contentType) {
      const { error } = await service.storage.from(EMAIL_BUCKET).upload(path, buffer, { contentType, upsert: true })
      if (error) throw new Error(`store ${path}: ${error.message}`)
    },
    async getFile(path) {
      const { data, error } = await service.storage.from(EMAIL_BUCKET).download(path)
      if (error || !data) throw new Error(`read ${path}: ${error?.message || 'missing'}`)
      return Buffer.from(await data.arrayBuffer())
    },
  }
}
