import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth/get-user'
import { createServiceClient } from '@/lib/supabase/server'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { BookingWizard } from './booking-wizard'
import { getUserDrafts } from './actions'

const TOTAL_PARKING = 27

async function getAvailableParking(): Promise<number> {
  try {
    const supabase = await createServiceClient()
    const { data } = await supabase
      .from('bookings')
      .select('additional_parking')
      .neq('status', 'DRAFT')
      .is('deleted_at', null)
    const booked = (data || []).reduce((s, b) => s + (Number(b.additional_parking) || 0), 0)
    return Math.max(0, TOTAL_PARKING - booked)
  } catch {
    return TOTAL_PARKING
  }
}

export default async function NewBookingPage({
  searchParams,
}: {
  searchParams: Promise<{ unit?: string }>
}) {
  try {
    const profile = await requireRole(['ADMIN'])
    if (!profile) {
      redirect('/login')
    }

    const [drafts, params, availableParking] = await Promise.all([
      getUserDrafts(),
      searchParams,
      getAvailableParking(),
    ])
    const prefilledUnit = params.unit ?? null

    return (
      <DashboardLayout profile={profile}>
        <div className="max-w-5xl mx-auto space-y-8">
          <div>
            <h1 className="text-3xl font-semibold text-zinc-900">New Booking</h1>
            <p className="text-zinc-600 mt-1">
              {prefilledUnit ? `Creating booking for flat ${prefilledUnit}` : 'Create a new property booking'}
            </p>
          </div>

          <BookingWizard drafts={drafts} prefilledUnit={prefilledUnit} availableParking={availableParking} />
        </div>
      </DashboardLayout>
    )
  } catch (err: unknown) {
    // Next.js redirect() throws an error with digest NEXT_REDIRECT; rethrow so redirect works
    const d = typeof err === 'object' && err !== null && (err as { digest?: string }).digest
    if (typeof d === 'string' && d.startsWith('NEXT_REDIRECT')) {
      throw err
    }
    console.error('New booking page error:', err instanceof Error ? err.message : err)
    redirect('/login')
  }
}

