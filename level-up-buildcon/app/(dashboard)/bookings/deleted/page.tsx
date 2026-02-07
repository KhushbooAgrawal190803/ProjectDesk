import { requireRole } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Booking, Profile } from '@/lib/types/database'
import { format } from 'date-fns'
import { RotateCcw, FileText } from 'lucide-react'
import { RestoreBookingButton } from './restore-button'

interface DeletedBookingWithCreator extends Booking {
  creator: Profile
  deleter?: Profile
  deleted_at?: string
  deleted_by?: string
}

async function getDeletedBookings() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('bookings')
    .select(`
      *,
      creator:profiles!created_by(*),
      deleter:profiles!deleted_by(*)
    `)
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false })

  if (error) {
    console.error('Error fetching deleted bookings:', error)
    return []
  }

  return data as DeletedBookingWithCreator[]
}

export default async function DeletedBookingsPage() {
  const profile = await requireRole(['ADMIN'])
  const deletedBookings = await getDeletedBookings()

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount)
  }

  return (
    <DashboardLayout profile={profile}>
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-semibold text-zinc-900">Deleted Bookings</h1>
          <p className="text-zinc-600 mt-1">Manage and restore deleted property bookings</p>
        </div>

        {/* Table */}
        <Card className="border-zinc-200 shadow-sm">
          <CardHeader>
            <CardTitle>Deleted Items</CardTitle>
          </CardHeader>
          <CardContent>
            {deletedBookings.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-4">
                <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center">
                  <FileText className="w-8 h-8 text-zinc-400" />
                </div>
                <p className="text-zinc-600">No deleted bookings</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-zinc-50">
                      <TableHead>Serial</TableHead>
                      <TableHead>Applicant</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Created By</TableHead>
                      <TableHead>Deleted By</TableHead>
                      <TableHead>Deleted On</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deletedBookings.map((booking) => (
                      <TableRow key={booking.id} className="hover:bg-zinc-50">
                        <TableCell className="font-mono font-semibold text-sm">
                          {booking.serial_display}
                        </TableCell>
                        <TableCell className="font-medium">{booking.applicant_name}</TableCell>
                        <TableCell>{booking.project_name}</TableCell>
                        <TableCell>{formatCurrency(booking.total_cost)}</TableCell>
                        <TableCell className="text-sm text-zinc-600">
                          {booking.creator?.full_name}
                        </TableCell>
                        <TableCell className="text-sm text-zinc-600">
                          {booking.deleter?.full_name}
                        </TableCell>
                        <TableCell className="text-sm text-zinc-600">
                          {booking.deleted_at && format(new Date(booking.deleted_at), 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell className="text-right">
                          <RestoreBookingButton bookingId={booking.id} bookingSerial={booking.serial_display || 'N/A'} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
