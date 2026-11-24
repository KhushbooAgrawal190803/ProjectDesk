import { redirect } from 'next/navigation'
import { requireStaffPage } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { BookingsTable } from './bookings-table'
import { Booking, Profile } from '@/lib/types/database'
import { considerationOf } from '@/lib/booking/consideration'
import { hundredthsToString, percentOfPaise } from '@/lib/booking/money'
import { installmentGstPaise, paiseFrom, todayInTimeZone } from '@/lib/demands/engine'
import { loadAllocatedByRow, loadLedgerTotals } from '@/lib/ledger/load'
import { paymentStanding, type PaymentStanding } from '@/components/booking/status-badge'

interface BookingWithCreator extends Booking {
  creator: Profile
}

async function getBookings(searchParams: {
  search?: string
  project?: string
  status?: string
  unit_category?: string
  created_by?: string
  payment_mode?: string
  from_date?: string
  to_date?: string
}) {
  const supabase = await createClient()

  let query = supabase
    .from('bookings')
    .select(`
      *,
      creator:profiles!created_by(*)
    `)
    .neq('status', 'DRAFT')
    .is('deleted_at', null)

  // Apply filters
  const term = (searchParams.search || '').replace(/[,()%*]/g, ' ').trim()
  if (term) {
    const { data: people } = await supabase.from('booking_coapplicants').select('booking_id').or(`name.ilike.%${term}%,mobile.ilike.%${term}%`)
    const coapplicantBookings = [...new Set((people || []).map((row) => row.booking_id as string))]
    const clauses = [
      `serial_display.ilike.%${term}%`,
      `applicant_name.ilike.%${term}%`,
      `applicant_mobile.ilike.%${term}%`,
      `unit_no.ilike.%${term}%`,
      `coapplicant_name.ilike.%${term}%`,
    ]
    if (coapplicantBookings.length) clauses.push(`id.in.(${coapplicantBookings.join(',')})`)
    query = query.or(clauses.join(','))
  }

  if (searchParams.project) {
    query = query.eq('project_name', searchParams.project)
  }

  if (searchParams.status) {
    query = query.eq('status', searchParams.status)
  }

  if (searchParams.unit_category) {
    query = query.eq('unit_category', searchParams.unit_category)
  }

  if (searchParams.created_by) {
    query = query.eq('created_by', searchParams.created_by)
  }

  if (searchParams.payment_mode) {
    query = query.eq('payment_mode', searchParams.payment_mode)
  }

  if (searchParams.from_date) {
    query = query.gte('submitted_at', searchParams.from_date)
  }

  if (searchParams.to_date) {
    query = query.lte('submitted_at', `${searchParams.to_date}T23:59:59.999+05:30`)
  }

  query = query.order('submitted_at', { ascending: false })

  const { data, error } = await query

  if (error) {
    console.error('Failed to fetch bookings:', error)
    return []
  }

  return data as BookingWithCreator[]
}

export interface BookingMoney {
  /** Total Consideration, excluding GST, with the GST on it alongside. */
  consideration: string
  considerationGst: string
  payable: string
  /** Received money split the same way, so both columns compare like with like. */
  received: string
  receivedPrincipal: string
  receivedGst: string
  coapplicants: number
  standing: PaymentStanding
}

/** Received and payable from the payment ledger, so this list agrees with the booking and payments pages. */
async function getMoneyByBooking(bookings: BookingWithCreator[]): Promise<Record<string, BookingMoney>> {
  const supabase = await createClient()
  const ids = bookings.map((booking) => booking.id)
  const result: Record<string, BookingMoney> = {}
  if (!ids.length) return result
  const today = todayInTimeZone(new Date())
  const [totals, rows, notes, people, milestones] = await Promise.all([
    loadLedgerTotals(supabase, ids).catch(() => new Map()),
    supabase.from('booking_schedule_rows').select('id, booking_id, calculated_amount, trigger_type, milestone_id, milestone_date').in('booking_id', ids),
    supabase.from('demand_notes').select('booking_id, schedule_row_id, payment_deadline').in('booking_id', ids),
    supabase.from('booking_coapplicants').select('booking_id').in('booking_id', ids),
    supabase.from('construction_milestones').select('id, completed_at'),
  ])
  const scheduleRows = rows.data || []
  const allocated = await loadAllocatedByRow(supabase, scheduleRows.map((row) => row.id as string)).catch(() => new Map())
  const completed = new Set((milestones.data || []).filter((item) => item.completed_at).map((item) => item.id as string))
  const deadline = new Map((notes.data || []).map((note) => [note.schedule_row_id as string, note.payment_deadline as string]))
  for (const booking of bookings) {
    const own = scheduleRows.filter((row) => row.booking_id === booking.id)
    const consideration = considerationOf(booking)?.totalPaise ?? 0n
    let payable = consideration
    let dueNow = 0n
    let overdue = 0n
    for (const row of own) {
      const principal = paiseFrom(row.calculated_amount)
      const gst = installmentGstPaise(principal)
      payable += gst
      const got = allocated.get(row.id as string) || { principalPaise: 0n, gstPaise: 0n }
      const left = (principal > got.principalPaise ? principal - got.principalPaise : 0n) + (gst > got.gstPaise ? gst - got.gstPaise : 0n)
      const isDue = row.trigger_type === 'date' ? String(row.milestone_date || '') <= today : completed.has(row.milestone_id as string)
      if (isDue) dueNow += left
      const by = deadline.get(row.id as string)
      if (by && today > by) overdue += left
    }
    if (!own.length) payable += percentOfPaise(consideration, 5) ?? 0n
    const money = totals.get(booking.id)
    const received = money ? money.receivedPrincipalPaise + money.receivedGstPaise : 0n
    result[booking.id] = {
      consideration: hundredthsToString(consideration),
      considerationGst: hundredthsToString(payable - consideration),
      payable: hundredthsToString(payable),
      received: hundredthsToString(received),
      receivedPrincipal: hundredthsToString(money?.receivedPrincipalPaise ?? 0n),
      receivedGst: hundredthsToString(money?.receivedGstPaise ?? 0n),
      coapplicants: (people.data || []).filter((row) => row.booking_id === booking.id).length,
      standing: paymentStanding({ outstandingPaise: payable > received ? payable - received : 0n, overduePaise: overdue, dueNowPaise: dueNow, receivedTotalPaise: received }),
    }
  }
  return result
}

async function getFilterOptions() {
  const supabase = await createClient()

  const [{ data: projects }, { data: users }] = await Promise.all([
    supabase
      .from('bookings')
      .select('project_name')
      .neq('status', 'DRAFT')
      .is('deleted_at', null)
      .order('project_name'),
    supabase
      .from('profiles')
      .select('id, full_name')
      .eq('status', 'ACTIVE')
      .order('full_name'),
  ])

  const uniqueProjects = [...new Set(projects?.map(p => p.project_name) || [])]

  return {
    projects: uniqueProjects,
    users: users || [],
  }
}

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    search?: string
    project?: string
    status?: string
    unit_category?: string
    created_by?: string
    payment_mode?: string
    from_date?: string
    to_date?: string
  }>
}) {
  const profile = await requireStaffPage()
  if (!profile) {
    redirect('/login')
  }

  const params = await searchParams

  const [bookings, filterOptions] = await Promise.all([
    getBookings(params),
    getFilterOptions(),
  ])
  const money = await getMoneyByBooking(bookings)

  return (
    <DashboardLayout profile={profile}>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-semibold text-zinc-900">All Bookings</h1>
          <p className="text-zinc-600 mt-1">View and manage all property bookings</p>
        </div>

        <BookingsTable
          bookings={bookings}
          filterOptions={filterOptions}
          currentRole={profile.role}
          money={money}
        />
      </div>
    </DashboardLayout>
  )
}

