import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth/get-user'
import { createServiceClient } from '@/lib/supabase/server'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { IndianRupee, FileText, TrendingUp, Receipt } from 'lucide-react'
import { format } from 'date-fns'
import { getBookingsForDispatch } from './dispatch-actions'
import { PendingDispatchesClient } from './pending-dispatches-client'
import { PaymentReminderClient } from './payment-reminder-client'
// import { PaymentScheduleClient } from './payment-schedule-client'  // temporarily disabled

async function getAccountsData() {
  const supabase = await createServiceClient()

  // Get all non-draft, non-deleted bookings
  const { data: bookings } = await supabase
    .from('bookings')
    .select(`
      id,
      serial_display,
      applicant_name,
      unit_no,
      project_name,
      total_cost,
      booking_amount_paid,
      gst_amount,
      payment_mode,
      status,
      submitted_at,
      created_by,
      creator:profiles!created_by(full_name)
    `)
    .in('status', ['SUBMITTED', 'EDITED'])
    .is('deleted_at', null)
    .order('submitted_at', { ascending: false })

  const allBookings = bookings || []

  // Calculate summary stats
  const totalBookings = allBookings.length
  const totalAmount = allBookings.reduce((sum, b) => sum + (b.total_cost || 0), 0)
  const totalBookingAmountReceived = allBookings.reduce((sum, b) => sum + (b.booking_amount_paid || 0), 0)
  const totalGST = allBookings.reduce((sum, b) => sum + (b.gst_amount || 0), 0)

  return {
    bookings: allBookings,
    stats: {
      totalBookings,
      totalAmount,
      totalBookingAmountReceived,
      totalGST,
    },
  }
}

export default async function AccountsPage() {
  const profile = await requireRole(['ACCOUNTS', 'ADMIN'])
  if (!profile) {
    redirect('/login')
  }

  const { bookings, stats } = await getAccountsData()

  const bookingsForDispatch = await getBookingsForDispatch()

  // Admin also sees pending dispatches (from old dispatch system — kept for now)
  let pendingDispatches: any[] = []

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
          <h1 className="text-3xl font-semibold text-zinc-900">Accounts</h1>
          <p className="text-zinc-600 mt-1">Financial overview and document dispatch</p>
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
              <p className="text-xs text-zinc-500 mt-1">Approved bookings</p>
            </CardContent>
          </Card>

          <Card className="border-zinc-200 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-zinc-600">
                Total Property Value
              </CardTitle>
              <TrendingUp className="w-4 h-4 text-zinc-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{formatCurrency(stats.totalAmount)}</div>
              <p className="text-xs text-zinc-500 mt-1">Sum of total costs</p>
            </CardContent>
          </Card>

          <Card className="border-zinc-200 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-zinc-600">
                Booking Amount Received
              </CardTitle>
              <IndianRupee className="w-4 h-4 text-zinc-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{formatCurrency(stats.totalBookingAmountReceived)}</div>
              <p className="text-xs text-zinc-500 mt-1">Total amount collected</p>
            </CardContent>
          </Card>

          <Card className="border-zinc-200 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-zinc-600">
                GST Collected
              </CardTitle>
              <Receipt className="w-4 h-4 text-zinc-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{formatCurrency(stats.totalGST)}</div>
              <p className="text-xs text-zinc-500 mt-1">Total GST (5%)</p>
            </CardContent>
          </Card>
        </div>

        {/* Admin: Pending Dispatches (shown at top if any) */}
        {profile.role === 'ADMIN' && pendingDispatches.length > 0 && (
          <PendingDispatchesClient dispatches={pendingDispatches} />
        )}

        {/* Tabs: Financials and Document Dispatch */}
        <Tabs defaultValue="financials" className="space-y-4">
          <TabsList>
            <TabsTrigger value="financials">Booking Financials</TabsTrigger>
            {/* <TabsTrigger value="payment-schedule">Payment Schedule (Slabs)</TabsTrigger> */}
            <TabsTrigger value="dispatch">Payment Reminders</TabsTrigger>
          </TabsList>

          {/* Financials Tab */}
          <TabsContent value="financials">
            <Card className="border-zinc-200 shadow-sm">
              <CardHeader>
                <CardTitle>Booking Financials</CardTitle>
              </CardHeader>
              <CardContent>
                {bookings.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-zinc-500">No approved bookings yet</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-zinc-50">
                          <TableHead className="font-semibold">Serial</TableHead>
                          <TableHead className="font-semibold">Applicant</TableHead>
                          <TableHead className="font-semibold">Project</TableHead>
                          <TableHead className="font-semibold">Unit</TableHead>
                          <TableHead className="font-semibold text-right">Total Cost</TableHead>
                          <TableHead className="font-semibold text-right">Booking Amount</TableHead>
                          <TableHead className="font-semibold text-right">GST</TableHead>
                          <TableHead className="font-semibold">Payment</TableHead>
                          <TableHead className="font-semibold">Date</TableHead>
                          <TableHead className="font-semibold">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {bookings.map((booking: any) => (
                          <TableRow key={booking.id} className="hover:bg-zinc-50">
                            <TableCell>
                              <Badge variant="outline" className="font-mono">
                                {booking.serial_display}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-medium">{booking.applicant_name || '-'}</TableCell>
                            <TableCell className="text-zinc-600">{booking.project_name || '-'}</TableCell>
                            <TableCell className="text-zinc-600">{booking.unit_no || '-'}</TableCell>
                            <TableCell className="text-right font-medium">
                              {booking.total_cost ? formatCurrency(booking.total_cost) : '-'}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {booking.booking_amount_paid ? formatCurrency(booking.booking_amount_paid) : '-'}
                            </TableCell>
                            <TableCell className="text-right text-zinc-600">
                              {booking.gst_amount ? formatCurrency(booking.gst_amount) : '-'}
                            </TableCell>
                            <TableCell className="text-zinc-600">
                              {booking.payment_mode ? booking.payment_mode.replace('_', ' / ') : '-'}
                            </TableCell>
                            <TableCell className="text-zinc-600 text-sm">
                              {booking.submitted_at && format(new Date(booking.submitted_at), 'MMM d, yyyy')}
                            </TableCell>
                            <TableCell>
                              <Badge variant="default" className="bg-green-600">
                                {booking.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Payment Reminders Tab */}
          <TabsContent value="dispatch">
            <PaymentReminderClient />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  )
}
