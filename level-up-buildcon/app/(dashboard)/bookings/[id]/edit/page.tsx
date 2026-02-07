import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { Booking, Profile } from '@/lib/types/database'
import { BookingEditForm } from './booking-edit-form'

interface BookingWithCreator extends Booking {
  creator: Profile
}

async function getBooking(id: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('bookings')
    .select(`
      *,
      creator:profiles!created_by(*)
    `)
    .eq('id', id)
    .single()

  if (error || !data) {
    return null
  }

  return data as BookingWithCreator
}

export default async function BookingEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await requireRole(['ADMIN', 'EXECUTIVE'])
  const booking = await getBooking(id)

  if (!booking) {
    redirect('/bookings')
  }

  return (
    <DashboardLayout profile={profile}>
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href={`/bookings/${booking.id}`}>
            <Button variant="ghost" size="sm" className="gap-2">
              <ChevronLeft className="w-4 h-4" />
              Back to Booking
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-semibold text-zinc-900">Edit Booking</h1>
            <p className="text-zinc-600 mt-1">Serial: {booking.serial_display}</p>
          </div>
        </div>

        {/* Edit Form */}
        <Card className="border-zinc-200 shadow-sm">
          <CardHeader>
            <CardTitle>Booking Information</CardTitle>
          </CardHeader>
          <CardContent>
            <BookingEditForm booking={booking} />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
