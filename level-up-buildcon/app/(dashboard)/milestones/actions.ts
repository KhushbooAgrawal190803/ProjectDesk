'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/get-user'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { paiseFrom, todayInTimeZone } from '@/lib/demands/engine'
import { loadDemandRules, reconcileBooking } from '@/lib/demands/issue'

export async function markMilestoneComplete(milestoneId: string, completedOn: string) {
  const profile = await requireAdmin()
  const supabase = await createClient()
  const rules = await loadDemandRules(supabase)
  const today = todayInTimeZone(new Date(), rules.timezone)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(completedOn) || completedOn > today) {
    throw new Error('The completion date cannot be in the future.')
  }

  const { data: milestone, error: readError } = await supabase
    .from('construction_milestones')
    .select('id, completed_at, label')
    .eq('id', milestoneId)
    .single()
  if (readError || !milestone) throw new Error('Milestone not found')

  if (!milestone.completed_at) {
    const { error } = await supabase
      .from('construction_milestones')
      .update({ completed_at: completedOn, completed_by: profile.id })
      .eq('id', milestoneId)
      .is('completed_at', null)
    if (error) throw new Error(error.message)
  }

  const { data: rows, error: rowError } = await supabase
    .from('booking_schedule_rows')
    .select('booking_id')
    .eq('milestone_id', milestoneId)
  if (rowError) throw new Error(rowError.message)

  const issued: string[] = []
  const failed: string[] = []
  const bookingIds = [...new Set((rows || []).map((row) => row.booking_id as string))]
  for (const bookingId of bookingIds) {
    try {
      const result = await reconcileBooking(supabase, bookingId, { today, actorId: profile.id })
      issued.push(...result.issued)
    } catch (error) {
      failed.push(error instanceof Error ? error.message : 'Demand note could not be issued')
    }
  }

  let emailed: { recipients: number; queued: boolean; awaiting: boolean } = { recipients: 0, queued: false, awaiting: false }
  try {
    const { queueMilestoneCompleted } = await import('@/lib/email/service')
    const event = await queueMilestoneCompleted(milestoneId, profile.id)
    if (event) emailed = { recipients: event.recipients.length, queued: event.status === 'queued', awaiting: event.status === 'awaiting_recipients' }
  } catch (error) {
    console.error('[email] milestone email could not be queued:', error instanceof Error ? error.message : error)
  }

  revalidatePath('/milestones')
  revalidatePath('/demand-notes')
  revalidatePath('/bookings')
  revalidatePath('/downloads')
  return { issued, failed, checked: bookingIds.length, emailed }
}

interface UndoPlan {
  label: string
  withdraw: Array<{ id: string; booking_id: string; reference_number: string }>
  keep: Array<{ id: string; booking_id: string; reference_number: string }>
}

/**
 * Demand notes for this milestone. A note whose installment has no money applied can be
 * withdrawn; a note with money applied stays on file, because a payment was taken against it.
 */
async function planUndo(milestoneId: string): Promise<UndoPlan> {
  const supabase = await createClient()
  const { data: milestone, error } = await supabase
    .from('construction_milestones')
    .select('id, label, completed_at')
    .eq('id', milestoneId)
    .single()
  if (error || !milestone) throw new Error('Milestone not found')
  if (!milestone.completed_at) throw new Error('This milestone is not completed')

  const { data: notes, error: noteError } = await supabase
    .from('demand_notes')
    .select('id, booking_id, reference_number, schedule_row_id')
    .eq('milestone_id', milestoneId)
  if (noteError) throw new Error(noteError.message)
  const rowIds = (notes || []).map((note) => note.schedule_row_id as string)
  const { data: allocations, error: allocationError } = rowIds.length
    ? await supabase.from('installment_allocations').select('schedule_row_id, principal_amount, gst_amount').in('schedule_row_id', rowIds)
    : { data: [], error: null }
  if (allocationError) throw new Error(allocationError.message)
  const paidRows = new Set(
    (allocations || [])
      .filter((item) => paiseFrom(item.principal_amount) + paiseFrom(item.gst_amount) > 0n)
      .map((item) => item.schedule_row_id as string)
  )
  const plan: UndoPlan = { label: milestone.label as string, withdraw: [], keep: [] }
  for (const note of notes || []) {
    const item = { id: note.id as string, booking_id: note.booking_id as string, reference_number: note.reference_number as string }
    if (paidRows.has(note.schedule_row_id as string)) plan.keep.push(item)
    else plan.withdraw.push(item)
  }
  return plan
}

export async function previewMilestoneUndo(milestoneId: string) {
  await requireAdmin()
  const plan = await planUndo(milestoneId)
  return {
    withdraw: plan.withdraw.map((note) => note.reference_number),
    keep: plan.keep.map((note) => note.reference_number),
  }
}

/** Admin correction: the milestone goes back to pending and unpaid demand notes for it are withdrawn. */
export async function markMilestoneNotCompleted(milestoneId: string, reason: string) {
  const profile = await requireAdmin()
  if (!reason.trim()) throw new Error('Give a reason for marking this milestone not completed')
  const supabase = await createClient()
  const plan = await planUndo(milestoneId)

  const { data: current } = await supabase.from('construction_milestones').select('*').eq('id', milestoneId).single()
  const reopen: Record<string, unknown> = { completed_at: null, completed_by: null }
  // A later completion is a new event, so its demand notes are emailed again.
  if (current && 'completion_version' in current) reopen.completion_version = Number(current.completion_version || 0) + 1
  const { error } = await supabase.from('construction_milestones').update(reopen).eq('id', milestoneId)
  if (error) throw new Error(error.message)

  // Issued notes cannot be deleted by signed-in users; this runs only after the admin check above.
  if (plan.withdraw.length) {
    const service = await createServiceClient()
    const { error: deleteError } = await service.from('demand_notes').delete().in('id', plan.withdraw.map((note) => note.id))
    if (deleteError) throw new Error(`The milestone is pending again, but the demand notes could not be withdrawn: ${deleteError.message}`)
  }

  const audit = [
    ...plan.withdraw.map((note) => ({
      booking_id: note.booking_id,
      changed_by: profile.id,
      action: 'DEMAND_WITHDRAWN',
      reason: `Demand note ${note.reference_number} withdrawn: "${plan.label}" marked not completed. ${reason.trim()}`,
    })),
    ...plan.keep.map((note) => ({
      booking_id: note.booking_id,
      changed_by: profile.id,
      action: 'MILESTONE_REOPENED',
      reason: `"${plan.label}" marked not completed. Demand note ${note.reference_number} kept because a payment is applied to it. ${reason.trim()}`,
    })),
  ]
  if (audit.length) await supabase.from('booking_audit_log').insert(audit)

  revalidatePath('/milestones')
  revalidatePath('/demand-notes')
  revalidatePath('/bookings')
  revalidatePath('/downloads')
  return { withdrawn: plan.withdraw.length, kept: plan.keep.length }
}
