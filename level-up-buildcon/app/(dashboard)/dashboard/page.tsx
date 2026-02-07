import { redirect } from 'next/navigation'
import { requireProfile } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { RecentBookings } from './recent-bookings'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { 
  FileText, 
  Users, 
  IndianRupee, 
  TrendingUp
} from 'lucide-react'
import { Booking, Profile as ProfileType } from '@/lib/types/database'

async function getDashboardStats() {
  const supabase = await createClient()

  // Get total bookings
  const { count: totalBookings } = await supabase
    .from('bookings')
    .select('*', { count: 'exact', head: true })
    .neq('status', 'DRAFT')
    .is('deleted_at', null)

  // Get this week's bookings
  const oneWeekAgo = new Date()
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)
  
  const { count: weekBookings } = await supabase
    .from('bookings')
    .select('*', { count: 'exact', head: true })
    .gte('submitted_at', oneWeekAgo.toISOString())
    .neq('status', 'DRAFT')
    .is('deleted_at', null)

  // Get total booking amount
  const { data: bookingsData } = await supabase
    .from('bookings')
    .select('booking_amount_paid')
    .neq('status', 'DRAFT')
    .is('deleted_at', null)

  const totalAmount = bookingsData?.reduce((sum, b) => sum + (b.booking_amount_paid || 0), 0) || 0

  // Get active users count
  const { count: activeUsers } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'ACTIVE')

  // Get recent bookings
  const { data: recentBookings } = await supabase
    .from('bookings')
    .select(`
      *,
      creator:profiles!created_by(full_name, email)
    `)
    .neq('status', 'DRAFT')
    .is('deleted_at', null)
    .order('submitted_at', { ascending: false })
    .limit(10)

  return {
    totalBookings: totalBookings || 0,
    weekBookings: weekBookings || 0,
    totalAmount,
    activeUsers: activeUsers || 0,
    recentBookings: recentBookings || [],
  }
}

export default async function DashboardPage() {
  const profile = await requireProfile()
  if (!profile) {
    redirect('/login')
  }

  const stats = await getDashboardStats()

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount)
  }

  return (
    <DashboardLayout profile={profile}>
      <div className="space-y-8">
        {/* Page Header */}
        <div>
          <h1 className="text-3xl font-semibold text-zinc-900">Dashboard</h1>
          <p className="text-zinc-600 mt-1">Welcome back, {profile.full_name}</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="border-zinc-200 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-zinc-600">
                Total Bookings
              </CardTitle>
              <FileText className="w-4 h-4 text-zinc-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{stats.totalBookings}</div>
              <p className="text-xs text-zinc-500 mt-1">All time</p>
            </CardContent>
          </Card>

          <Card className="border-zinc-200 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-zinc-600">
                This Week
              </CardTitle>
              <TrendingUp className="w-4 h-4 text-zinc-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{stats.weekBookings}</div>
              <p className="text-xs text-zinc-500 mt-1">Last 7 days</p>
            </CardContent>
          </Card>

          <Card className="border-zinc-200 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-zinc-600">
                Total Booking Amount
              </CardTitle>
              <IndianRupee className="w-4 h-4 text-zinc-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{formatCurrency(stats.totalAmount)}</div>
              <p className="text-xs text-zinc-500 mt-1">All bookings</p>
            </CardContent>
          </Card>

          <Card className="border-zinc-200 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-zinc-600">
                Active Users
              </CardTitle>
              <Users className="w-4 h-4 text-zinc-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{stats.activeUsers}</div>
              <p className="text-xs text-zinc-500 mt-1">Staff members</p>
            </CardContent>
          </Card>
        </div>

        {/* Recent Activity */}
        <RecentBookings bookings={stats.recentBookings} />
      </div>
    </DashboardLayout>
  )
}

