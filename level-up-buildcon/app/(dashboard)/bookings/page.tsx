import { redirect } from 'next/navigation'
import { requireProfile } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { BookingsTable } from './bookings-table'
import { Booking, Profile } from '@/lib/types/database'

interface BookingWithCreator extends Booking {
  creator: Profile
}

async function getBookings(searchParams: {
  search?: string
  project?: string
  status?: string
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
  if (searchParams.search) {
    query = query.or(`serial_display.ilike.%${searchParams.search}%,applicant_name.ilike.%${searchParams.search}%,applicant_mobile.ilike.%${searchParams.search}%`)
  }

  if (searchParams.project) {
    query = query.eq('project_name', searchParams.project)
  }

  if (searchParams.status) {
    query = query.eq('status', searchParams.status)
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
    query = query.lte('submitted_at', searchParams.to_date)
  }

  query = query.order('submitted_at', { ascending: false })

  const { data, error } = await query

  if (error) {
    console.error('Failed to fetch bookings:', error)
    return []
  }

  return data as BookingWithCreator[]
}

async function getFilterOptions() {
  const supabase = await createClient()

  // Get unique projects
  const { data: projects } = await supabase
    .from('bookings')
    .select('project_name')
    .neq('status', 'DRAFT')
    .is('deleted_at', null)
    .order('project_name')

  const uniqueProjects = [...new Set(projects?.map(p => p.project_name) || [])]

  // Get users
  const { data: users } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('status', 'ACTIVE')
    .order('full_name')

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
    created_by?: string
    payment_mode?: string
    from_date?: string
    to_date?: string
  }>
}) {
  const profile = await requireProfile()
  if (!profile) {
    redirect('/login')
  }

  const params = await searchParams

  const [bookings, filterOptions] = await Promise.all([
    getBookings(params),
    getFilterOptions(),
  ])

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
        />
      </div>
    </DashboardLayout>
  )
}

