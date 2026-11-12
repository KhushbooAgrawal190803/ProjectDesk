import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CheckCircle2, Circle } from 'lucide-react'
import { requireStaffPage } from '@/lib/auth/get-user'
import { isAdmin } from '@/lib/auth/permissions'
import { createClient } from '@/lib/supabase/server'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatLetterDate } from '@/lib/documents/inr-words'
import { ACTIVE_BOOKING_STATUSES, todayInTimeZone } from '@/lib/demands/engine'
import { loadDemandRules } from '@/lib/demands/issue'
import { MarkCompleteForm } from './mark-complete-form'
import { UndoCompleteButton } from './undo-complete-button'

type Milestone = { id: string; label: string; code: string; sort_order: number; completed_at: string | null; project_name: string }

export default async function MilestonesPage() {
  const profile = await requireStaffPage()
  if (!profile) redirect('/login')
  const supabase = await createClient()

  let milestones: Milestone[] = []
  let today = todayInTimeZone(new Date())
  let loadError: string | null = null
  const bookingsByMilestone = new Map<string, Set<string>>()
  const notesByMilestone = new Map<string, number>()
  try {
    const rules = await loadDemandRules(supabase)
    today = todayInTimeZone(new Date(), rules.timezone)
    const [milestoneResult, bookingResult, noteResult] = await Promise.all([
      supabase.from('construction_milestones').select('id, label, code, sort_order, completed_at, project_name').order('sort_order'),
      supabase.from('bookings').select('id').in('status', [...ACTIVE_BOOKING_STATUSES]).is('deleted_at', null),
      supabase.from('demand_notes').select('milestone_id'),
    ])
    if (milestoneResult.error) throw new Error(milestoneResult.error.message)
    milestones = milestoneResult.data || []
    const activeIds = (bookingResult.data || []).map((row) => row.id as string)
    if (activeIds.length) {
      const { data: rows } = await supabase.from('booking_schedule_rows').select('booking_id, milestone_id').in('booking_id', activeIds).not('milestone_id', 'is', null)
      for (const row of rows || []) {
        const set = bookingsByMilestone.get(row.milestone_id) || new Set<string>()
        set.add(row.booking_id)
        bookingsByMilestone.set(row.milestone_id, set)
      }
    }
    for (const note of noteResult.data || []) {
      if (note.milestone_id) notesByMilestone.set(note.milestone_id, (notesByMilestone.get(note.milestone_id) || 0) + 1)
    }
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Milestones are not available yet.'
  }

  const completed = milestones.filter((item) => item.completed_at)
  const pending = milestones.filter((item) => !item.completed_at)
  const next = pending[0]

  return (
    <DashboardLayout profile={profile}>
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-3xl font-semibold text-zinc-900">Construction Milestones</h1>
          <p className="mt-2 text-zinc-600">
            Milestones belong to the project. Marking one complete makes that installment due on every active booking that uses it, including flats booked later, and issues their demand notes.
          </p>
        </div>
        {loadError && (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="pt-6 text-sm text-amber-900">
              Run <span className="font-mono">supabase/migrations/006_demand_notes.sql</span> in the Supabase SQL editor, then reload this page.
            </CardContent>
          </Card>
        )}

        <Card className="border-zinc-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Pending · in construction order</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-zinc-100">
            {pending.length === 0 && <p className="py-2 text-sm text-zinc-500">Every milestone is completed.</p>}
            {pending.map((milestone) => {
              const affected = bookingsByMilestone.get(milestone.id)?.size || 0
              return (
                <div key={milestone.id} className="flex flex-col gap-3 py-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-start gap-3">
                    <Circle className="mt-0.5 h-4 w-4 shrink-0 text-zinc-300" />
                    <div>
                      <p className="font-medium text-zinc-900">
                        {milestone.sort_order}. {milestone.label}
                        {milestone.id === next?.id && <span className="ml-2 rounded-full bg-zinc-900 px-2 py-0.5 text-xs text-white">Next</span>}
                      </p>
                      <p className="text-xs text-zinc-500">{affected} active booking{affected === 1 ? '' : 's'} have this installment</p>
                    </div>
                  </div>
                  {isAdmin(profile) ? (
                    <MarkCompleteForm id={milestone.id} label={milestone.label} today={today} affectedBookings={affected} />
                  ) : (
                    <p className="text-sm text-zinc-500">Not completed</p>
                  )}
                </div>
              )
            })}
          </CardContent>
        </Card>

        <Card className="border-zinc-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Completed</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-zinc-100">
            {completed.length === 0 && <p className="py-2 text-sm text-zinc-500">No milestone is completed yet.</p>}
            {completed.map((milestone) => {
              const notes = notesByMilestone.get(milestone.id) || 0
              return (
                <div key={milestone.id} className="flex flex-col gap-1 py-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <p className="font-medium text-zinc-900">{milestone.sort_order}. {milestone.label}</p>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="font-medium text-emerald-700">Completed {formatLetterDate(milestone.completed_at)}</span>
                    <Link href={`/demand-notes?trigger=${encodeURIComponent(`milestone:${milestone.label}`)}`} className="text-zinc-600 hover:text-zinc-900 hover:underline">
                      {notes} demand note{notes === 1 ? '' : 's'}
                    </Link>
                    {isAdmin(profile) && <UndoCompleteButton id={milestone.id} label={milestone.label} />}
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}

// Document generation and the background email after a save can take longer than the default limit.
export const maxDuration = 300
