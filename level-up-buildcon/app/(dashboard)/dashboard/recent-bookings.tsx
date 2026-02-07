'use client'

import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { FileText, Building2, Calendar } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

interface RecentBookingsProps {
  bookings: Array<{
    id: string
    serial_display: string
    status: string
    applicant_name: string
    project_name: string
    unit_no: string
    booking_amount_paid: number
    submitted_at: string
    creator?: {
      full_name: string
    }
  }>
}

export function RecentBookings({ bookings }: RecentBookingsProps) {
  const router = useRouter()

  const formatCurrency = (amount: number) => {
    return `₹${(amount || 0).toLocaleString('en-IN')}`
  }

  return (
    <Card className="border-zinc-200 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Recent Activity</CardTitle>
        <CardDescription>Latest booking submissions</CardDescription>
      </CardHeader>
      <CardContent>
        {bookings.length === 0 ? (
          <div className="text-center py-12">
            <Building2 className="w-12 h-12 text-zinc-300 mx-auto mb-3" />
            <p className="text-zinc-600 font-medium">No bookings yet</p>
            <p className="text-sm text-zinc-500 mt-1">
              Start by creating your first booking
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {bookings.map((booking) => (
              <div
                key={booking.id}
                onClick={() => router.push(`/bookings/${booking.id}`)}
                className="flex items-center justify-between p-4 rounded-lg border border-zinc-200 hover:bg-zinc-50 transition-colors cursor-pointer"
              >
                <div className="flex items-start gap-4 flex-1">
                  <div className="w-10 h-10 bg-zinc-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-zinc-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="font-mono text-xs">
                        {booking.serial_display}
                      </Badge>
                      <Badge 
                        variant={booking.status === 'SUBMITTED' ? 'default' : 'secondary'}
                        className="text-xs"
                      >
                        {booking.status}
                      </Badge>
                    </div>
                    <p className="font-medium text-zinc-900 truncate">
                      {booking.applicant_name}
                    </p>
                    <div className="flex items-center gap-4 mt-1 text-sm text-zinc-500">
                      <span>{booking.project_name}</span>
                      <span>•</span>
                      <span>Unit {booking.unit_no}</span>
                      <span>•</span>
                      <span>{formatCurrency(booking.booking_amount_paid)}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right text-sm text-zinc-500 flex-shrink-0 ml-4">
                  <div className="flex items-center gap-1 mb-1">
                    <Calendar className="w-3 h-3" />
                    {booking.submitted_at && formatDistanceToNow(new Date(booking.submitted_at), { addSuffix: true })}
                  </div>
                  <div className="text-xs">
                    by {booking.creator?.full_name}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
