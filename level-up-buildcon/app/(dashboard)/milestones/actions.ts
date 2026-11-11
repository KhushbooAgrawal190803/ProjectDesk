'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { todayInTimeZone } from '@/lib/demands/engine'
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
  for (const bookingId of [...new Set((rows || []).map((row) => row.booking_id as string))]) {
    const result = await reconcileBooking(supabase, bookingId, { today, actorId: profile.id })
    issued.push(...result.issued)
  }

  revalidatePath('/milestones')
  revalidatePath('/demand-notes')
  revalidatePath('/bookings')
  return { issued }
}
