import { redirect } from 'next/navigation'
import { requireProfile } from '@/lib/auth/get-user'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { BookingWizard } from './booking-wizard'
import { getUserDrafts } from './actions'

export default async function NewBookingPage() {
  const profile = await requireProfile()
  if (!profile) {
    redirect('/login')
  }

  const drafts = await getUserDrafts()

  return (
    <DashboardLayout profile={profile}>
      <div className="max-w-5xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-semibold text-zinc-900">New Booking</h1>
          <p className="text-zinc-600 mt-1">Create a new property booking</p>
        </div>

        <BookingWizard drafts={drafts} />
      </div>
    </DashboardLayout>
  )
}

