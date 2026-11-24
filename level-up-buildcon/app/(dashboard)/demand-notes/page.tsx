import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireStaffPage } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DateField } from '@/components/ui/date-field'
import { InstallmentStatusBadge } from '@/components/booking/status-badge'
import { formatInr } from '@/lib/booking/money'
import { formatPersonName } from '@/lib/booking/person'
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
  booking_id: string
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

const selectClass = 'mt-1 block h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm'

export default async function DemandNotesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const profile = await requireStaffPage()
  if (!profile) redirect('/login')
  const params = await searchParams
  const filters = {
    q: one(params.q).trim(),
    trigger: one(params.trigger),
    status: one(params.status),
    from: one(params.from),
    to: one(params.to),
  }
  const supabase = await createClient()
  let notes: NoteRow[] = []
  let loadError: string | null = null
  let today = todayInTimeZone(new Date())
  const receivedByRow = new Map<string, { principal: bigint; gst: bigint }>()
  const bookingInfo = new Map<string, { serial: string; people: string[]; scheduledDate: string | null }>()
  const rowDates = new Map<string, string | null>()

  try {
    const [rules, { data, error }] = await Promise.all([
      loadDemandRules(supabase),
      supabase.from('demand_notes').select('*').order('issue_date', { ascending: false }),
    ])
    today = todayInTimeZone(new Date(), rules.timezone)
    if (error) throw new Error(error.message)
    notes = (data || []) as NoteRow[]
    const rowIds = notes.map((note) => note.schedule_row_id)
    const bookingIds = [...new Set(notes.map((note) => note.booking_id))]
    const [allocations, bookings, coapplicants, rows] = await Promise.all([
      rowIds.length ? supabase.from('installment_allocations').select('schedule_row_id, principal_amount, gst_amount').in('schedule_row_id', rowIds) : Promise.resolve({ data: [], error: null }),
      bookingIds.length ? supabase.from('bookings').select('id, serial_display, applicant_salutation, applicant_name').in('id', bookingIds) : Promise.resolve({ data: [], error: null }),
      bookingIds.length ? supabase.from('booking_coapplicants').select('booking_id, salutation, name').in('booking_id', bookingIds) : Promise.resolve({ data: [], error: null }),
      rowIds.length ? supabase.from('booking_schedule_rows').select('id, trigger_type, milestone_date').in('id', rowIds) : Promise.resolve({ data: [], error: null }),
    ])
    if (allocations.error) throw new Error(allocations.error.message)
    for (const item of allocations.data || []) {
      const current = receivedByRow.get(item.schedule_row_id) || { principal: 0n, gst: 0n }
      current.principal += paiseFrom(item.principal_amount)
      current.gst += paiseFrom(item.gst_amount)
      receivedByRow.set(item.schedule_row_id, current)
    }
    for (const booking of bookings.data || []) {
      bookingInfo.set(booking.id, {
        serial: booking.serial_display || '',
        people: [formatPersonName(booking.applicant_salutation, booking.applicant_name)],
        scheduledDate: null,
      })
    }
    for (const person of coapplicants.data || []) {
      bookingInfo.get(person.booking_id)?.people.push(formatPersonName(person.salutation, person.name))
    }
    for (const row of rows.data || []) {
      rowDates.set(row.id, row.trigger_type === 'date' ? String(row.milestone_date || '').slice(0, 10) || null : null)
    }
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Demand notes are not available yet.'
  }

  const milestoneLabels = [...new Set(notes.filter((note) => !rowDates.get(note.schedule_row_id)).map((note) => note.trigger_label))]
  const scheduledDates = [...new Set(notes.map((note) => rowDates.get(note.schedule_row_id)).filter(Boolean) as string[])].sort()

  const all = notes.map((note) => {
    const due = { principal: paiseFrom(note.installment_amount), gst: paiseFrom(note.gst_amount) }
    const received = receivedByRow.get(note.schedule_row_id) || { principal: 0n, gst: 0n }
    const outstanding = subtractSplit(due, received)
    const status = collectionStatus({ due: true, demanded: true, outstanding, received })
    const overdue = isOverdue({ demanded: true, outstanding, deadline: note.payment_deadline, today })
    const info = bookingInfo.get(note.booking_id)
    return { note, due, received, outstanding, status: displayStatus(status, overdue), overdue, info, scheduledDate: rowDates.get(note.schedule_row_id) || null }
  })
  const rows = all.filter(({ note, status, info, scheduledDate }) => {
    if (filters.q) {
      const q = filters.q.toLowerCase()
      const haystack = [note.unit_no, note.reference_number, note.applicant_name, info?.serial, ...(info?.people || [])].join(' ').toLowerCase()
      if (!haystack.includes(q)) return false
    }
    if (filters.trigger.startsWith('date:') && scheduledDate !== filters.trigger.slice(5)) return false
    if (filters.trigger.startsWith('milestone:') && (scheduledDate || note.trigger_label !== filters.trigger.slice(10))) return false
    if (filters.from && note.issue_date < filters.from) return false
    if (filters.to && note.issue_date > filters.to) return false
    if (filters.status === 'overdue') return status === 'Overdue'
    if (filters.status === 'paid') return status === 'Paid'
    if (filters.status === 'partial') return status === 'Partially Paid'
    if (filters.status === 'due') return status === 'Due'
    return true
  })

  const totals = rows.reduce(
    (sum, row) => ({
      demanded: sum.demanded + row.due.principal + row.due.gst,
      collected: sum.collected + row.received.principal + row.received.gst,
      outstanding: sum.outstanding + row.outstanding.principal + row.outstanding.gst,
      overdue: sum.overdue + (row.overdue ? row.outstanding.principal + row.outstanding.gst : 0n),
    }),
    { demanded: 0n, collected: 0n, outstanding: 0n, overdue: 0n }
  )
  const filtered = Boolean(filters.q || filters.trigger || filters.status || filters.from || filters.to)

  return (
    <DashboardLayout profile={profile}>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold text-zinc-900">Demand Notes</h1>
          <p className="mt-1 text-zinc-600">Notes are issued automatically when a construction milestone is completed or a scheduled date arrives. One note per installment, never twice.</p>
        </div>
        {loadError && (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="pt-6 text-sm text-amber-900">
              Run <span className="font-mono">supabase/migrations/006_demand_notes.sql</span> in the Supabase SQL editor, then reload this page.
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ['Notes issued', String(rows.length)],
            ['Demanded', formatInr(totals.demanded)],
            ['Collected', formatInr(totals.collected)],
            ['Outstanding', formatInr(totals.outstanding)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-900">{value}</p>
            </div>
          ))}
        </div>
        {totals.overdue > 0n && <p className="text-sm text-red-600">{formatInr(totals.overdue)} is overdue.</p>}

        <form className="flex flex-wrap items-end gap-3 rounded-xl border border-zinc-200 bg-white p-4" method="get">
          <label className="min-w-64 flex-1 text-sm text-zinc-600">
            Search
            <Input name="q" defaultValue={filters.q} className="mt-1" placeholder="Purchaser, co-applicant, flat, serial or note number" />
          </label>
          <label className="text-sm text-zinc-600">
            Installment
            <select name="trigger" defaultValue={filters.trigger} className={selectClass}>
              <option value="">All</option>
              {milestoneLabels.length > 0 && (
                <optgroup label="Construction milestones">
                  {milestoneLabels.map((label) => <option key={label} value={`milestone:${label}`}>{label}</option>)}
                </optgroup>
              )}
              {scheduledDates.length > 0 && (
                <optgroup label="Scheduled dates">
                  {scheduledDates.map((date) => <option key={date} value={`date:${date}`}>{formatLetterDate(date)}</option>)}
                </optgroup>
              )}
            </select>
          </label>
          <label className="text-sm text-zinc-600">
            Payment status
            <select name="status" defaultValue={filters.status} className={selectClass}>
              <option value="">All</option>
              <option value="due">Due</option>
              <option value="partial">Partially Paid</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
            </select>
          </label>
          <label className="text-sm text-zinc-600">
            Issued from
            <DateField name="from" defaultValue={filters.from} className="mt-1" />
          </label>
          <label className="text-sm text-zinc-600">
            To
            <DateField name="to" defaultValue={filters.to} className="mt-1" />
          </label>
          <Button type="submit">Apply</Button>
          {filtered && (
            <Link href="/demand-notes"><Button type="button" variant="outline">Clear filters</Button></Link>
          )}
        </form>

        <p className="text-sm text-zinc-600">
          {filtered ? `${rows.length} of ${all.length} notes match` : `${rows.length} ${rows.length === 1 ? 'note' : 'notes'}`}
        </p>
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                {['Note', 'Booking', 'Purchaser(s)', 'Installment', 'Pay by', 'Outstanding', 'Status', ''].map((heading) => (
                  <th key={heading || 'actions'} className="px-4 py-3 font-medium">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map(({ note, outstanding, status, info, scheduledDate }) => (
                <tr key={note.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/demand-notes/${note.id}`} className="hover:underline">{note.reference_number}</Link>
                    <div className="text-xs text-zinc-500">Issued {formatLetterDate(note.issue_date)}</div>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/bookings/${note.booking_id}`} className="hover:underline">{info?.serial || '—'} · Flat {note.unit_no}</Link>
                  </td>
                  <td className="px-4 py-3">{(info?.people || [note.applicant_name || '—']).join(', ')}</td>
                  <td className="px-4 py-3">
                    {note.trigger_label}
                    <div className="text-xs text-zinc-500">{scheduledDate ? 'Scheduled date' : 'Construction milestone'}</div>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{formatLetterDate(note.payment_deadline)}</td>
                  <td className="px-4 py-3 tabular-nums">{formatInr(outstanding.principal + outstanding.gst)}</td>
                  <td className="px-4 py-3"><InstallmentStatusBadge status={status} /></td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <a href={`/api/demand-notes/${note.id}/pdf`} target="_blank" rel="noreferrer">
                      <Button variant="outline" size="sm">Download PDF</Button>
                    </a>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-zinc-500">
                    {filtered ? 'No notes match these filters.' : 'No demand notes yet. A note appears here when an installment on a finalized booking becomes due.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  )
}
