import { redirect } from 'next/navigation'
import { requireStaffPage } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Download, FileArchive, FileText } from 'lucide-react'
import { loadDemandGroups, type DemandDownloadGroup } from '@/lib/downloads/groups'
import { DEMAND_TIMEZONE, todayInTimeZone } from '@/lib/demands/engine'
import { isAdmin } from '@/lib/auth/permissions'
import { formatLetterDate } from '@/lib/documents/inr-words'
import { EmailBulkButton } from '@/components/email/email-bulk-button'
import type { ManualCategory } from '@/lib/email/documents'

export default async function DownloadsPage() {
  const profile = await requireStaffPage()
  if (!profile) {
    redirect('/login')
  }
  const supabase = await createClient()
  const today = todayInTimeZone(new Date(), DEMAND_TIMEZONE)
  const [{ count: bookingCount }, { count: nocCount }, { data: units }, { groups: demandGroups }] = await Promise.all([
    supabase.from('bookings').select('id', { count: 'exact', head: true }).neq('status', 'DRAFT').is('deleted_at', null),
    supabase.from('bookings').select('id', { count: 'exact', head: true }).neq('status', 'DRAFT').is('deleted_at', null).eq('noc_required', true),
    supabase.from('bookings').select('unit_no').neq('status', 'DRAFT').is('deleted_at', null),
    loadDemandGroups(supabase, today),
  ])
  const agreementCount = (units || []).length
  const milestoneGroups = demandGroups.filter((group) => group.kind === 'milestone')
  const dateGroups = demandGroups.filter((group) => group.kind === 'date')
  const statusLabel = { ready: 'Issued', waiting: 'Due, not issued yet', not_due: 'Not yet due' }
  const issuedNotes = demandGroups.reduce((sum, group) => sum + group.noteIds.length, 0)
  const canEmail = isAdmin(profile)

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

        <h2 className="text-xl font-semibold text-zinc-900">Booking Documents</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {([
            ['Allotment letters', bookingCount || 0, '/api/downloads/bundle?kind=allotment', 'allotment', 'Email All Allotment Letters', 'Allotment Letters'],
            ['NOCs', nocCount || 0, '/api/downloads/bundle?kind=noc', 'noc', 'Email All NOCs', 'NOCs'],
            ['Agreements for Sale', agreementCount || 0, '/api/downloads/bundle?kind=agreement', 'agreement', 'Email All Agreements for Sale', 'Agreements for Sale'],
          ] as Array<[string, number, string, ManualCategory, string, string]>).map(([title, count, href, category, emailLabel, noun]) => (
            <Card key={title} className="border-zinc-200 shadow-sm">
              <CardHeader>
                <CardTitle>{title}</CardTitle>
                <CardDescription>{count} document{count === 1 ? '' : 's'}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {count > 0 ? (
                  <>
                    <Button asChild variant="outline" className="w-full gap-2">
                      <a href={href}><Download className="w-4 h-4" />Download ZIP</a>
                    </Button>
                    {canEmail && <EmailBulkButton category={category} label={emailLabel} noun={noun} className="w-full" />}
                  </>
                ) : (
                  <p className="text-sm text-zinc-500">Nothing to download yet.</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="border-zinc-200 shadow-sm">
          <CardHeader>
            <CardTitle>All Demand Notes</CardTitle>
            <CardDescription>
              {issuedNotes} issued demand note{issuedNotes === 1 ? '' : 's'} across every completed milestone and elapsed scheduled date, in one folder per stage. Future installments have no notes and are never included.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {issuedNotes > 0 ? (
              <>
                <Button asChild variant="outline" className="gap-2">
                  <a href="/api/downloads/bundle?kind=demand_all"><Download className="w-4 h-4" />Download ZIP</a>
                </Button>
                {canEmail && <EmailBulkButton category="demand_all" label="Email All Demand Notes" noun="Demand Notes" />}
              </>
            ) : (
              <p className="text-sm text-zinc-500">No demand notes have been issued yet.</p>
            )}
          </CardContent>
        </Card>

        <DemandGroupList
          title="Demand Notes by Construction Milestone"
          empty="No construction-linked installments on active bookings."
          groups={milestoneGroups}
          statusLabel={statusLabel}
          canEmail={canEmail}
        />
        <DemandGroupList
          title="Demand Notes by Scheduled Date"
          empty="No installment on an active booking is tied to a calendar date."
          groups={dateGroups}
          statusLabel={statusLabel}
          canEmail={canEmail}
        />
      </div>
    </DashboardLayout>
  )
}

function DemandGroupList({
  title,
  empty,
  groups,
  statusLabel,
  canEmail,
}: {
  title: string
  empty: string
  groups: DemandDownloadGroup[]
  statusLabel: Record<DemandDownloadGroup['status'], string>
  canEmail: boolean
}) {
  return (
    <div className="space-y-3">
      <h2 className="text-xl font-semibold text-zinc-900">{title}</h2>
      {groups.map((group) => (
        <div key={group.key} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3">
          <div>
            <p className="font-medium text-zinc-900">{group.title}</p>
            <p className="text-sm text-zinc-500">
              {group.noteIds.length} of {group.count} note{group.count === 1 ? '' : 's'} issued · {statusLabel[group.status]}
              {group.kind === 'milestone' && group.completedAt && ` · Completed ${formatLetterDate(String(group.completedAt).slice(0, 10))}`}
            </p>
          </div>
          {group.status === 'ready' ? (
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" className="gap-2">
                <a href={`/api/downloads/bundle?kind=demand&group=${encodeURIComponent(group.key)}`}><Download className="w-4 h-4" />Download ZIP</a>
              </Button>
              {canEmail && (
                <EmailBulkButton
                  category="demand_group"
                  groupKey={group.key}
                  label={group.kind === 'date' ? 'Email All for This Date' : 'Email All for This Milestone'}
                  noun="Demand Notes"
                />
              )}
            </div>
          ) : (
            <Button variant="outline" disabled className="gap-2">
              <Download className="w-4 h-4" />
              {group.status === 'not_due' ? 'Not yet due' : 'Not issued yet'}
            </Button>
          )}
        </div>
      ))}
      {groups.length === 0 && <p className="text-sm text-zinc-500">{empty}</p>}
    </div>
  )
}


// Document generation and the background email after a save can take longer than the default limit.
export const maxDuration = 300
