import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireStaffPage } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatInr } from '@/lib/booking/money'
import { formatLetterDate } from '@/lib/documents/inr-words'
import {
  collectionStatus,
  displayStatus,
  isOverdue,
  paiseFrom,
  subtractSplit,
  todayInTimeZone,
} from '@/lib/demands/engine'
import { loadDemandRules } from '@/lib/demands/issue'

interface NoteRow {
  id: string
  reference_number: string
  unit_no: string
  applicant_name: string | null
  owner_type: string
  trigger_label: string
  issue_date: string
  payment_deadline: string
  project_name: string
  installment_amount: string
  gst_amount: string
  schedule_row_id: string
}

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || '' : value || ''
}

export default async function DemandNotesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const profile = await requireStaffPage()
  if (!profile) redirect('/login')
  const params = await searchParams
  const filters = {
    project: one(params.project),
    owner: one(params.owner),
    unit: one(params.unit),
    applicant: one(params.applicant),
    milestone: one(params.milestone),
    from: one(params.from),
    to: one(params.to),
    status: one(params.status),
  }
  const supabase = await createClient()
  let notes: NoteRow[] = []
  let loadError: string | null = null
  let today = todayInTimeZone(new Date())
  const receivedByRow = new Map<string, { principal: bigint; gst: bigint }>()

  try {
    const rules = await loadDemandRules(supabase)
    today = todayInTimeZone(new Date(), rules.timezone)
    const { data, error } = await supabase.from('demand_notes').select('*').order('issue_date', { ascending: false })
    if (error) throw new Error(error.message)
    notes = (data || []) as NoteRow[]
    const rowIds = notes.map((note) => note.schedule_row_id)
    if (rowIds.length) {
      const { data: allocations, error: allocationError } = await supabase
        .from('installment_allocations')
        .select('schedule_row_id, principal_amount, gst_amount')
        .in('schedule_row_id', rowIds)
      if (allocationError) throw new Error(allocationError.message)
      for (const item of allocations || []) {
        const current = receivedByRow.get(item.schedule_row_id) || { principal: 0n, gst: 0n }
        current.principal += paiseFrom(item.principal_amount)
        current.gst += paiseFrom(item.gst_amount)
        receivedByRow.set(item.schedule_row_id, current)
      }
    }
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Demand notes are not available yet.'
  }

  const rows = notes.map((note) => {
    const due = { principal: paiseFrom(note.installment_amount), gst: paiseFrom(note.gst_amount) }
    const received = receivedByRow.get(note.schedule_row_id) || { principal: 0n, gst: 0n }
    const outstanding = subtractSplit(due, received)
    const status = collectionStatus({ due: true, demanded: true, outstanding, received })
    const overdue = isOverdue({ demanded: true, outstanding, deadline: note.payment_deadline, today })
    return { note, due, received, outstanding, status: displayStatus(status, overdue), overdue }
  }).filter(({ note, status }) => {
    if (filters.project && note.project_name !== filters.project) return false
    if (filters.owner && note.owner_type !== filters.owner) return false
    if (filters.unit && !note.unit_no.toLowerCase().includes(filters.unit.toLowerCase())) return false
    if (filters.applicant && !String(note.applicant_name || '').toLowerCase().includes(filters.applicant.toLowerCase())) return false
    if (filters.milestone && note.trigger_label !== filters.milestone) return false
    if (filters.from && note.issue_date < filters.from) return false
    if (filters.to && note.issue_date > filters.to) return false
    if (filters.status === 'overdue') return status === 'Overdue'
    if (filters.status === 'paid') return status === 'Paid'
    if (filters.status === 'partial') return status === 'Partially Paid'
    if (filters.status === 'unpaid') return status === 'Unpaid'
    return true
  })

  const totals = rows.reduce(
    (sum, row) => ({
      demanded: sum.demanded + row.due.principal + row.due.gst,
      demandedGst: sum.demandedGst + row.due.gst,
      collected: sum.collected + row.received.principal + row.received.gst,
      collectedGst: sum.collectedGst + row.received.gst,
      outstanding: sum.outstanding + row.outstanding.principal + row.outstanding.gst,
      outstandingGst: sum.outstandingGst + row.outstanding.gst,
      overdue: sum.overdue + (row.overdue ? row.outstanding.principal + row.outstanding.gst : 0n),
    }),
    { demanded: 0n, demandedGst: 0n, collected: 0n, collectedGst: 0n, outstanding: 0n, outstandingGst: 0n, overdue: 0n }
  )

  return (
    <DashboardLayout profile={profile}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Demand notes</h1>
          <p className="mt-1 text-sm text-zinc-600">Print a note, or open it to record what was paid.</p>
        </div>
        {loadError && (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="pt-6 text-sm text-amber-900">
              Run <span className="font-mono">supabase/migrations/006_demand_notes.sql</span> in the Supabase SQL editor, then reload this page.
            </CardContent>
          </Card>
        )}
        <form className="flex flex-wrap items-end gap-3 border border-zinc-200 bg-white p-3" method="get">
          <label className="text-sm text-zinc-600">
            Flat
            <Input name="unit" defaultValue={filters.unit} className="mt-1 w-28" />
          </label>
          <label className="text-sm text-zinc-600">
            Purchaser
            <Input name="applicant" defaultValue={filters.applicant} className="mt-1 w-56" />
          </label>
          <label className="text-sm text-zinc-600">
            Status
            <select name="status" defaultValue={filters.status} className="mt-1 block h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm">
              <option value="">All</option>
              <option value="unpaid">Unpaid</option>
              <option value="partial">Partially paid</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
            </select>
          </label>
          <Button type="submit" variant="outline">Show</Button>
        </form>
        <p className="text-sm text-zinc-600">
          {rows.length} {rows.length === 1 ? 'note' : 'notes'}
          {' · '}
          {formatInr(totals.outstanding)} still to collect
          {totals.overdue > 0n ? ` · ${formatInr(totals.overdue)} overdue` : ''}
        </p>
        <div className="overflow-x-auto border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-zinc-500">
                {['Note', 'Flat', 'Purchaser', 'Stage', 'Pay by', 'Outstanding', ''].map((heading) => (
                  <th key={heading || 'actions'} className="px-3 py-2 font-medium">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ note, outstanding }) => (
                <tr key={note.id} className="border-b border-zinc-100">
                  <td className="px-3 py-2 font-medium">
                    <Link href={`/demand-notes/${note.id}`}>{note.reference_number}</Link>
                  </td>
                  <td className="px-3 py-2">{note.unit_no}</td>
                  <td className="px-3 py-2">{note.applicant_name || '—'}</td>
                  <td className="px-3 py-2">{note.trigger_label}</td>
                  <td className="px-3 py-2">{formatLetterDate(note.payment_deadline)}</td>
                  <td className="px-3 py-2">{formatInr(outstanding.principal + outstanding.gst)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <a className="font-medium text-zinc-900" href={`/api/demand-notes/${note.id}/pdf`} target="_blank" rel="noreferrer">Print</a>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-8 text-zinc-500">No demand notes yet. A note appears here when an installment on a finalized booking becomes due.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  )
}
