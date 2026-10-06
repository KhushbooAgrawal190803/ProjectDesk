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
    <Card className="min-w-0 border-zinc-200 shadow-sm xl:self-start">
      <CardHeader className="border-b border-zinc-100 pb-4">
        <CardTitle className="text-lg font-semibold">Recent Activity</CardTitle>
        <CardDescription>Latest booking submissions</CardDescription>
      </CardHeader>
      <CardContent className="max-h-[32rem] overflow-y-auto overflow-x-hidden">
        {bookings.length === 0 ? (
          <div className="py-10 text-center">
            <Building2 className="mx-auto mb-3 size-10 text-zinc-300" />
            <p className="font-medium text-zinc-600">No bookings yet</p>
            <p className="mt-1 text-sm text-zinc-500">Start by creating your first booking</p>
          </div>
        ) : (
          <div className="space-y-3">
            {bookings.map((booking) => (
              <button
                key={booking.id}
                type="button"
                onClick={() => router.push(`/bookings/${booking.id}`)}
                className="w-full rounded-lg border border-zinc-200 p-3 text-left transition-colors hover:bg-zinc-50"
              >
                <div className="flex items-start gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100">
                    <FileText className="size-4 text-zinc-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
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
                    <p className="truncate font-medium text-zinc-900">{booking.applicant_name}</p>
                    <p className="mt-1 truncate text-sm text-zinc-500">
                      Unit {booking.unit_no} · {formatCurrency(booking.booking_amount_paid)}
                    </p>
                    <div className="mt-2 flex items-center gap-1 text-xs text-zinc-400">
                      <Calendar className="size-3 shrink-0" />
                      <span className="truncate">
                        {booking.submitted_at &&
                          formatDistanceToNow(new Date(booking.submitted_at), { addSuffix: true })}
                        {booking.creator?.full_name && ` · ${booking.creator.full_name}`}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
