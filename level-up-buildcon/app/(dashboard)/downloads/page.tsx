import { redirect } from 'next/navigation'
import { requireStaffPage } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Download, FileArchive, FileText } from 'lucide-react'
import { groupDemandDownloads } from '@/lib/downloads/groups'
import { DEMAND_TIMEZONE, todayInTimeZone } from '@/lib/demands/engine'

export default async function DownloadsPage() {
  const profile = await requireStaffPage()
  if (!profile) {
    redirect('/login')
  }
  const supabase = await createClient()
  const today = todayInTimeZone(new Date(), DEMAND_TIMEZONE)
  const [{ count: bookingCount }, { count: nocCount }, { count: agreementCount }, notesResult, rowsResult] = await Promise.all([
    supabase.from('bookings').select('id', { count: 'exact', head: true }).neq('status', 'DRAFT').is('deleted_at', null),
    supabase.from('bookings').select('id', { count: 'exact', head: true }).neq('status', 'DRAFT').is('deleted_at', null).eq('noc_required', true),
    supabase.from('booking_generated_documents').select('id', { count: 'exact', head: true }).eq('kind', 'agreement').eq('finalized', true),
    supabase.from('demand_notes').select('id, trigger_label, schedule_row_id'),
    supabase.from('booking_schedule_rows').select('id, label, trigger_type, milestone_date'),
  ])
  const noteByRow = new Map((notesResult.data || []).map((note) => [note.schedule_row_id as string, note]))
  const demandGroups = groupDemandDownloads((rowsResult.data || []).map((row) => {
    const note = noteByRow.get(row.id as string)
    const dateTitle = row.trigger_type === 'date' && row.milestone_date
      ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${row.milestone_date}T00:00:00Z`))
      : ''
    return {
      trigger: dateTitle || (note?.trigger_label as string) || (row.label as string) || 'Installment',
      due: Boolean(note) || (row.trigger_type === 'date' && String(row.milestone_date) <= today),
      noteId: (note?.id as string) || null,
    }
  }))
  const statusLabel = { ready: 'Ready', waiting: 'Due, not issued', not_due: 'Not yet due' }

  return (
    <DashboardLayout profile={profile}>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-semibold text-zinc-900">Bulk Downloads</h1>
          <p className="text-zinc-600 mt-1">Download company and customer PDFs in a single archive</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="border-zinc-200 shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <FileText className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <CardTitle>Company Copies</CardTitle>
                  <CardDescription className="mt-1">
                    All company PDF copies
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Button
                asChild
                className="w-full gap-2"
              >
                <a href="/api/bookings/bulk-download?kind=company">
                <Download className="w-4 h-4" />
                Download All Company PDFs
                </a>
              </Button>
            </CardContent>
          </Card>

          <Card className="border-zinc-200 shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <FileText className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <CardTitle>Customer Copies</CardTitle>
                  <CardDescription className="mt-1">
                    All customer acknowledgements
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Button
                asChild
                className="w-full gap-2"
              >
                <a href="/api/bookings/bulk-download?kind=customer">
                <Download className="w-4 h-4" />
                Download All Customer PDFs
                </a>
              </Button>
            </CardContent>
          </Card>

          <Card className="border-zinc-200 shadow-sm md:col-span-2">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                  <FileArchive className="w-6 h-6 text-purple-600" />
                </div>
                <div>
                  <CardTitle>Filtered Archive</CardTitle>
                  <CardDescription className="mt-1">
                    Download PDFs for filtered bookings from the registry
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-zinc-600 mb-4">
                Use the filters on the All Bookings page, then return here to download only the filtered results.
              </p>
              <Button
                asChild
                className="w-full gap-2"
                variant="outline"
              >
                <a href="/api/bookings/bulk-download?kind=both">
                  <FileArchive className="w-4 h-4" />
                  Download All PDFs (Company + Customer)
                </a>
              </Button>
              <p className="text-xs text-zinc-500 text-center mt-3">
                Uses all submitted, non-deleted bookings currently in the system.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            ['Allotment letters', bookingCount || 0, '/api/downloads/bundle?kind=allotment'],
            ['NOCs', nocCount || 0, '/api/downloads/bundle?kind=noc'],
            ['Agreements for Sale', agreementCount || 0, '/api/downloads/bundle?kind=agreement'],
          ].map(([title, count, href]) => (
            <Card key={String(title)} className="border-zinc-200 shadow-sm">
              <CardHeader>
                <CardTitle>{title}</CardTitle>
                <CardDescription>{count} document{count === 1 ? '' : 's'}</CardDescription>
              </CardHeader>
              <CardContent>
                {Number(count) > 0 ? (
                  <Button asChild variant="outline" className="w-full gap-2">
                    <a href={String(href)}><Download className="w-4 h-4" />Download ZIP</a>
                  </Button>
                ) : (
                  <p className="text-sm text-zinc-500">Nothing to download yet.</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="space-y-3">
          <h2 className="text-xl font-semibold text-zinc-900">Demand notes by stage</h2>
          {demandGroups.map((group) => (
            <div key={group.key} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3">
              <div>
                <p className="font-medium text-zinc-900">{group.title}</p>
                <p className="text-sm text-zinc-500">{group.count} instalment{group.count === 1 ? '' : 's'} · {statusLabel[group.status]}</p>
              </div>
              {group.status === 'ready' ? (
                <Button asChild variant="outline" className="gap-2">
                  <a href={`/api/downloads/bundle?kind=demand&group=${encodeURIComponent(group.key)}`}><Download className="w-4 h-4" />Download ZIP</a>
                </Button>
              ) : (
                <p className="text-sm text-zinc-500">{group.status === 'not_due' ? 'Not yet due' : 'Not issued'}</p>
              )}
            </div>
          ))}
          {demandGroups.length === 0 && <p className="text-sm text-zinc-500">No instalments are on the schedule yet.</p>}
        </div>
      </div>
    </DashboardLayout>
  )
}

