import type { ReactNode } from 'react'
import { requireStaffPage } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { RecentBookings } from './recent-bookings'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FileText, Users, IndianRupee, TrendingUp, ParkingSquare } from 'lucide-react'
import { getTowerAllocations } from '@/app/(dashboard)/lookup/tower-actions'
import { TowerView } from '@/app/(dashboard)/lookup/tower-view'
import { getOwnerTypeForFlat } from '@/lib/data/flat-ownership'

async function getDashboardStats() {
  const supabase = await createClient()

  const { count: totalBookings } = await supabase
    .from('bookings')
    .select('*', { count: 'exact', head: true })
    .neq('status', 'DRAFT')
    .is('deleted_at', null)

  const oneWeekAgo = new Date()
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)

  const { count: weekBookings } = await supabase
    .from('bookings')
    .select('*', { count: 'exact', head: true })
    .gte('submitted_at', oneWeekAgo.toISOString())
    .neq('status', 'DRAFT')
    .is('deleted_at', null)

  const { data: bookingsData } = await supabase
    .from('bookings')
    .select('booking_amount_paid, unit_no')
    .neq('status', 'DRAFT')
    .is('deleted_at', null)

  const totalAmount = bookingsData?.reduce((sum, b) => sum + (b.booking_amount_paid || 0), 0) || 0

  const ownerTotals = { DEVELOPER: { count: 0, amount: 0 }, LANDOWNER: { count: 0, amount: 0 } } as const
  for (const b of bookingsData || []) {
    const owner = getOwnerTypeForFlat((b as any).unit_no) || 'DEVELOPER'
    const amt = Number((b as any).booking_amount_paid) || 0
    ;(ownerTotals as any)[owner].count += 1
    ;(ownerTotals as any)[owner].amount += amt
  }

  const { count: activeUsers } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'ACTIVE')

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

  const { data: parkingData } = await supabase
    .from('bookings')
    .select('additional_parking, premium_parking')
    .neq('status', 'DRAFT')
    .is('deleted_at', null)
  const bookedParking = (parkingData || []).reduce((s, b) => s + (Number(b.additional_parking) || 0), 0)
  const availableParking = Math.max(0, 27 - bookedParking)
  const bookedPremiumParking = (parkingData || []).reduce((s, b) => s + (Number((b as any).premium_parking) || 0), 0)
  const availablePremiumParking = Math.max(0, 9 - bookedPremiumParking)

  return {
    totalBookings: totalBookings || 0,
    weekBookings: weekBookings || 0,
    totalAmount,
    ownerTotals,
    activeUsers: activeUsers || 0,
    recentBookings: recentBookings || [],
    availableParking,
    bookedParking,
    availablePremiumParking,
    bookedPremiumParking,
  }
}

function StatTile({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string
  value: ReactNode
  sub?: string
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <div className="rounded-xl border border-zinc-200/80 bg-white px-4 py-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
        <Icon className="size-4 shrink-0 text-zinc-400" />
      </div>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-zinc-500">{sub}</p>}
    </div>
  )
}

export default async function DashboardPage() {
  const profile = await requireStaffPage()

  const [stats, towerAllocations] = await Promise.all([
    getDashboardStats(),
    getTowerAllocations(),
  ])

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount)

  return (
    <DashboardLayout profile={profile}>
      <div className="flex min-h-[calc(100vh-9rem)] flex-col gap-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Dashboard</h1>
          <p className="mt-0.5 text-sm text-zinc-500">Welcome back, {profile.full_name}</p>
        </div>

        {/* Compact stats — always fills one row on laptop+ */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          <StatTile label="Total Bookings" value={stats.totalBookings} sub="All time" icon={FileText} />
          <StatTile label="This Week" value={stats.weekBookings} sub="Last 7 days" icon={TrendingUp} />
          <StatTile label="Total Amount" value={formatCurrency(stats.totalAmount)} sub="All bookings" icon={IndianRupee} />
          <StatTile label="Level Up Buildcon" value={stats.ownerTotals.DEVELOPER.count} sub={`${formatCurrency(stats.ownerTotals.DEVELOPER.amount)} booked`} icon={FileText} />
          <StatTile label="Balaji Hospitality" value={stats.ownerTotals.LANDOWNER.count} sub={`${formatCurrency(stats.ownerTotals.LANDOWNER.amount)} booked`} icon={FileText} />
          <StatTile
            label="Parking"
            value={
              <>
                {stats.availableParking}
                <span className="text-base font-normal text-zinc-400"> / 27</span>
              </>
            }
            sub={`Premium ${stats.availablePremiumParking}/9`}
            icon={ParkingSquare}
          />
          <StatTile label="Team" value={stats.activeUsers} sub="Active users" icon={Users} />
        </div>

        {/* Main: tower dominates, activity on the side */}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 xl:grid-cols-12">
          <Card className="flex flex-col border-zinc-200 shadow-sm xl:col-span-8">
            <CardHeader className="shrink-0 border-b border-zinc-100 pb-4">
              <CardTitle className="text-lg font-semibold">Anandam — Tower View</CardTitle>
            </CardHeader>
            <CardContent className="flex min-h-[32rem] flex-1 flex-col p-4 sm:p-6">
              <TowerView initialAllocations={towerAllocations} showHeader={false} size="large" />
            </CardContent>
          </Card>

          <div className="min-w-0 xl:col-span-4">
            <RecentBookings bookings={stats.recentBookings} />
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
