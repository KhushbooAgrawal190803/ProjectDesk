import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth/get-user'
import { createServiceClient } from '@/lib/supabase/server'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { BookingWizard } from './booking-wizard'
import { getUserDrafts } from './actions'

/** Uses cookies/session (requireRole / Supabase); must not be statically prerendered */
export const dynamic = 'force-dynamic'

const TOTAL_PARKING = 27
const TOTAL_PREMIUM_PARKING = 9

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

async function getAvailablePremiumParking(): Promise<number> {
  try {
    const supabase = await createServiceClient()
    const { data } = await supabase
      .from('bookings')
      .select('premium_parking')
      .neq('status', 'DRAFT')
      .is('deleted_at', null)
    const booked = (data || []).reduce((s, b) => s + (Number((b as any).premium_parking) || 0), 0)
    return Math.max(0, TOTAL_PREMIUM_PARKING - booked)
  } catch {
    return TOTAL_PREMIUM_PARKING
  }
}

export default async function NewBookingPage({
  searchParams,
}: {
  searchParams: Promise<{ unit?: string; draftId?: string }>
}) {
  try {
    const profile = await requireRole(['ADMIN', 'ACCOUNTS', 'EXECUTIVE'])
    if (!profile) {
      redirect('/login')
    }

    const [drafts, params, availableParking, availablePremiumParking] = await Promise.all([
      getUserDrafts(),
      searchParams,
      getAvailableParking(),
      getAvailablePremiumParking(),
    ])
    const prefilledUnit = params.unit ?? null
    const preselectedDraftId = params.draftId ?? null

    return (
      <DashboardLayout profile={profile}>
        <div className="max-w-5xl mx-auto space-y-8">
          <div>
            <h1 className="text-3xl font-semibold text-zinc-900">New Booking</h1>
            <p className="text-zinc-600 mt-1">
              {prefilledUnit ? `Creating booking for flat ${prefilledUnit}` : 'Create a new property booking'}
            </p>
          </div>

          <BookingWizard
            drafts={drafts}
            prefilledUnit={prefilledUnit}
            preselectedDraftId={preselectedDraftId}
            availableParking={availableParking}
            availablePremiumParking={availablePremiumParking}
          />
        </div>
      </DashboardLayout>
    )
  } catch (err: unknown) {
    // Next.js redirect() throws an error with digest NEXT_REDIRECT; rethrow so redirect works
    const d = typeof err === 'object' && err !== null && (err as { digest?: string }).digest
    if (typeof d === 'string' && d.startsWith('NEXT_REDIRECT')) {
      throw err
    }
    // Don't treat prerender/dynamic detection as an app error (should not occur with force-dynamic)
    const msg = err instanceof Error ? err.message : ''
    if (msg.includes("Route /new-booking couldn't be rendered statically") || msg.includes('Dynamic server usage')) {
      throw err
    }
    console.error('New booking page error:', msg || err)
    redirect('/login')
  }
}

