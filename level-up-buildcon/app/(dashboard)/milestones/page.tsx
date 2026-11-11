import { redirect } from 'next/navigation'
import { requireStaffPage } from '@/lib/auth/get-user'
import { isAdmin } from '@/lib/auth/permissions'
import { createClient } from '@/lib/supabase/server'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatLetterDate } from '@/lib/documents/inr-words'
import { todayInTimeZone } from '@/lib/demands/engine'
import { loadDemandRules } from '@/lib/demands/issue'
import { MarkCompleteForm } from './mark-complete-form'

export default async function MilestonesPage() {
  const profile = await requireStaffPage()
  if (!profile) redirect('/login')
  const supabase = await createClient()

  let milestones: Array<{
    id: string
    label: string
    code: string
    sort_order: number
    completed_at: string | null
    project_name: string
  }> = []
  let today = todayInTimeZone(new Date())
  let loadError: string | null = null
  try {
    const rules = await loadDemandRules(supabase)
    today = todayInTimeZone(new Date(), rules.timezone)
    const { data, error } = await supabase
      .from('construction_milestones')
      .select('id, label, code, sort_order, completed_at, project_name')
      .order('sort_order')
    if (error) throw new Error(error.message)
    milestones = data || []
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Milestones are not available yet.'
  }

  return (
    <DashboardLayout profile={profile}>
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-3xl font-semibold text-zinc-900">Construction milestones</h1>
          <p className="mt-2 text-zinc-600">
            These belong to the project. Marking one complete makes that installment due on every finalized booking that uses it, including flats booked later.
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
            <CardTitle className="text-lg">Anandam</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {milestones.map((milestone) => (
              <div key={milestone.id} className="flex flex-col gap-3 border-b border-zinc-100 py-3 last:border-0 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-medium text-zinc-900">{milestone.sort_order}. {milestone.label}</p>
                  <p className="text-xs text-zinc-500">{milestone.code}</p>
                </div>
                {milestone.completed_at ? (
                  <p className="text-sm font-medium text-green-700">Completed {formatLetterDate(milestone.completed_at)}</p>
                ) : isAdmin(profile) ? (
                  <MarkCompleteForm id={milestone.id} today={today} />
                ) : (
                  <p className="text-sm text-zinc-500">Not completed</p>
                )}
              </div>
            ))}
            {!loadError && milestones.length === 0 && <p className="text-sm text-zinc-500">No milestones are stored for this project yet.</p>}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
