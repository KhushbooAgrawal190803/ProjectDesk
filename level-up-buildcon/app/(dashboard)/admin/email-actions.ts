'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/get-user'
import { createServiceClient } from '@/lib/supabase/server'
import { normalizeEmail } from '@/lib/email/core'
import { DEMAND_TIMEZONE, todayInTimeZone } from '@/lib/demands/engine'
import { loadDemandGroups } from '@/lib/downloads/groups'
import type { ManualCategory } from '@/lib/email/documents'
import { emailTablesReady, manualPreview, queueManual, queueTest, resendEvent, retryFailed, sendAwaiting } from '@/lib/email/service'

const MIGRATION_HINT = 'Run supabase/migrations/011_email_delivery.sql in the Supabase SQL editor first.'

async function ready() {
  const profile = await requireAdmin()
  const service = await createServiceClient()
  if (!(await emailTablesReady(service))) throw new Error(MIGRATION_HINT)
  return { profile, service }
}

function refresh() {
  revalidatePath('/admin')
  revalidatePath('/admin/email')
  revalidatePath('/downloads')
}

export async function addRecipient(input: { email: string; label?: string }) {
  const { profile, service } = await ready()
  const email = normalizeEmail(input.email)
  if (!email) throw new Error('Enter a valid email address.')
  const { error } = await service.from('company_email_recipients').insert({ email, label: input.label?.trim() || null, created_by: profile.id })
  if (error) throw new Error(error.code === '23505' ? 'That address is already on the list.' : error.message)
  refresh()
  return { success: true }
}

export async function updateRecipient(id: string, input: { email?: string; label?: string; is_active?: boolean }) {
  const { service } = await ready()
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.email !== undefined) {
    const email = normalizeEmail(input.email)
    if (!email) throw new Error('Enter a valid email address.')
    patch.email = email
  }
  if (input.label !== undefined) patch.label = input.label.trim() || null
  if (input.is_active !== undefined) patch.is_active = input.is_active
  const { error } = await service.from('company_email_recipients').update(patch).eq('id', id)
  if (error) throw new Error(error.code === '23505' ? 'That address is already on the list.' : error.message)
  refresh()
  return { success: true }
}

export async function removeRecipient(id: string) {
  const { service } = await ready()
  // Past deliveries keep their own copy of the address, so history is not lost.
  const { error } = await service.from('company_email_recipients').delete().eq('id', id)
  if (error) throw new Error(error.message)
  refresh()
  return { success: true }
}

export async function sendTestEmail(target: string) {
  const { profile, service } = await ready()
  let onlyTo: string[] | null = null
  if (target !== 'all') {
    const email = normalizeEmail(target)
    if (!email) throw new Error('Choose a recipient.')
    const { data } = await service.from('company_email_recipients').select('email').ilike('email', email).maybeSingle()
    if (!data) throw new Error('Test emails go only to addresses on the company recipient list.')
    onlyTo = [data.email as string]
  }
  const created = await queueTest(onlyTo, profile.id)
  if (!created.recipients.length) throw new Error('There are no active company recipients.')
  const { data: deliveries } = await service.from('email_deliveries').select('recipient_email, status, last_error').eq('event_id', created.id)
  refresh()
  return { eventId: created.id, deliveries: deliveries || [] }
}

export async function retryEmail(eventId: string) {
  await ready()
  const result = await retryFailed(eventId)
  refresh()
  return result
}

export async function resendEmail(eventId: string) {
  const { profile } = await ready()
  const created = await resendEvent(eventId, profile.id)
  refresh()
  return { eventId: created.id, recipients: created.recipients }
}

export async function sendAwaitingEmail(eventId: string) {
  await ready()
  const result = await sendAwaiting(eventId)
  refresh()
  return result
}

const CATEGORIES: ManualCategory[] = ['allotment', 'noc', 'agreement', 'demand_all', 'demand_group']

/** The group is looked up on the server; a client cannot choose arbitrary documents. */
async function resolveGroup(category: ManualCategory, groupKey: string | null) {
  if (!CATEGORIES.includes(category)) throw new Error('Unknown document category.')
  if (category !== 'demand_group') return { noteIds: [] as string[], title: null as string | null }
  const service = await createServiceClient()
  const { groups } = await loadDemandGroups(service, todayInTimeZone(new Date(), DEMAND_TIMEZONE))
  const group = groups.find((item) => item.key === groupKey)
  if (!group) throw new Error('That demand note group was not found.')
  if (!group.noteIds.length) throw new Error('No demand notes have been issued for this group yet.')
  return { noteIds: group.noteIds, title: group.kind === 'date' ? `Demand Notes · Scheduled ${group.title}` : `Demand Notes · ${group.title}` }
}

export async function previewManualEmail(category: ManualCategory, groupKey: string | null) {
  await ready()
  const group = await resolveGroup(category, groupKey)
  return manualPreview(category, group.noteIds)
}

export async function sendManualEmail(category: ManualCategory, groupKey: string | null) {
  const { profile } = await ready()
  const group = await resolveGroup(category, groupKey)
  const created = await queueManual(category, group.title, group.noteIds, profile.id)
  refresh()
  return { eventId: created?.id || null, recipients: created?.recipients.length || 0, status: created?.status || 'queued' }
}
