import type { ReactNode } from 'react'
import { requireStaffPage } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { RecentBookings } from './recent-bookings'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getTowerAllocations } from '@/app/(dashboard)/lookup/tower-actions'
import { TowerView } from '@/app/(dashboard)/lookup/tower-view'
import { getOwnerTypeForFlat } from '@/lib/data/flat-ownership'
import { IstDate } from './ist-date'
import { loadLedgerTotals } from '@/lib/ledger/load'
import { hundredthsToString } from '@/lib/booking/money'

async function getDashboardStats() {
  const supabase = await createClient()

  const oneWeekAgo = new Date()
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)

  // All independent, so they run at the same time instead of one after another.
  const [
    { count: weekBookings },
    { data: bookingsData },
    { count: activeUsers },
    { data: recentBookings },
  ] = await Promise.all([
    supabase
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .gte('submitted_at', oneWeekAgo.toISOString())
      .neq('status', 'DRAFT')
      .is('deleted_at', null),
    // One read covers the booking count, owner split and parking totals.
    supabase
      .from('bookings')
      .select('id, unit_no, additional_parking, premium_parking')
      .neq('status', 'DRAFT')
      .is('deleted_at', null),
    supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'ACTIVE'),
    supabase
      .from('bookings')
      .select(`
        *,
        creator:profiles!created_by(full_name, email)
      `)
      .neq('status', 'DRAFT')
      .is('deleted_at', null)
      .order('submitted_at', { ascending: false })
      .limit(10),
  ])
  const totalBookings = bookingsData?.length ?? 0
  const parkingData = bookingsData

  // Received money comes from the payment ledger, the same source as the Payments page.
  const ledger = await loadLedgerTotals(supabase, (bookingsData || []).map((b) => b.id as string)).catch(() => new Map())
  const receivedOf = (id: string) => {
    const money = ledger.get(id)
    return money ? Number(hundredthsToString(money.receivedPrincipalPaise + money.receivedGstPaise)) : 0
  }
  const totalAmount = (bookingsData || []).reduce((sum, b) => sum + receivedOf(b.id as string), 0)

  const ownerTotals = { DEVELOPER: { count: 0, amount: 0 }, LANDOWNER: { count: 0, amount: 0 } }
  for (const b of bookingsData || []) {
    const owner = getOwnerTypeForFlat(b.unit_no as string) || 'DEVELOPER'
    ownerTotals[owner].count += 1
    ownerTotals[owner].amount += receivedOf(b.id as string)
  }

  const bookedParking = (parkingData || []).reduce((s, b) => s + (Number(b.additional_parking) || 0), 0)
  const availableParking = Math.max(0, 79 - bookedParking)
  const bookedPremiumParking = (parkingData || []).reduce((s, b) => s + (Number((b as any).premium_parking) || 0), 0)
  const availablePremiumParking = Math.max(0, 27 - bookedPremiumParking)

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

function StatTile({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="border border-zinc-200 bg-white px-4 py-3">
      <p className="text-xs text-zinc-500">{label}</p>
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
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Dashboard</h1>
            <p className="mt-0.5 text-sm text-zinc-500">Welcome back, {profile.full_name}</p>
          </div>
          <IstDate />
        </div>

        {/* Compact stats — always fills one row on laptop+ */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          <StatTile label="Total Bookings" value={stats.totalBookings} sub="All time" />
          <StatTile label="This Week" value={stats.weekBookings} sub="Last 7 days" />
          <StatTile label="Total Received" value={formatCurrency(stats.totalAmount)} sub="Cleared, incl. GST" />
          <StatTile label="Level Up Buildcon" value={stats.ownerTotals.DEVELOPER.count} sub={`${formatCurrency(stats.ownerTotals.DEVELOPER.amount)} received`} />
          <StatTile label="Balaji Hospitality" value={stats.ownerTotals.LANDOWNER.count} sub={`${formatCurrency(stats.ownerTotals.LANDOWNER.amount)} received`} />
          <StatTile
            label="Parking"
            value={
              <>
                {stats.availableParking}
                <span className="text-base font-normal text-zinc-400"> / 79</span>
              </>
            }
            sub={`Secondary ${stats.availablePremiumParking}/27`}
          />
          <StatTile label="Team" value={stats.activeUsers} sub="Active users" />
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
