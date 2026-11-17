import { redirect } from 'next/navigation'
import { requireStaffPage } from '@/lib/auth/get-user'
import { canEditBooking } from '@/lib/auth/permissions'
import { createClient } from '@/lib/supabase/server'
import { Booking, Profile } from '@/lib/types/database'

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
  const profile = await requireStaffPage()
  const booking = await getBooking(id)

  if (!booking) {
    redirect('/bookings')
  }

  if (!canEditBooking(profile, booking)) {
    redirect(`/bookings/${id}`)
  }

  redirect(`/new-booking?draftId=${id}`)
}
