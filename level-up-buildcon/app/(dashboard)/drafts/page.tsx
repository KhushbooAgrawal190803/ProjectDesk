import { requireStaffPage } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { considerationOf } from '@/lib/booking/consideration'
import { hundredthsToString } from '@/lib/booking/money'
import { formatPersonName } from '@/lib/booking/person'
import { DraftsList, type DraftRow } from './drafts-list'

export const dynamic = 'force-dynamic'

/**
 * Every unfinished booking in one place. Executives see their own drafts (the
 * database hides anyone else's); admins see every draft with who started it.
 */
export default async function DraftsPage() {
  const profile = await requireStaffPage()
  const supabase = await createClient()
  const isAdmin = profile.role === 'ADMIN'

  let query = supabase
    .from('bookings')
    .select('id, status, created_by, created_at, updated_at, unit_no, unit_type, project_name, applicant_salutation, applicant_name, applicant_mobile, super_builtup_area, rate_per_sqft, total_cost, basic_sale_price, total_property_value, total_parking_charges, creator:profiles!created_by(full_name)')
    .in('status', ['DRAFT', 'PENDING'])
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
  if (!isAdmin) query = query.eq('created_by', profile.id)
  const { data, error } = await query

  const rows: DraftRow[] = (data || []).map((booking) => {
    const record = booking as Record<string, unknown> & { creator?: { full_name?: string | null } | { full_name?: string | null }[] | null }
    const creator = Array.isArray(record.creator) ? record.creator[0] : record.creator
    const price = considerationOf(record as Parameters<typeof considerationOf>[0])?.totalPaise ?? null
    const checks = {
      unit: Boolean(record.unit_no),
      applicant: Boolean(record.applicant_name),
      contact: Boolean(record.applicant_mobile),
      price: price != null && price > 0n,
    }
    return {
      id: String(record.id),
      status: String(record.status),
      own: record.created_by === profile.id,
      creator: creator?.full_name || null,
      updatedAt: String(record.updated_at || record.created_at),
      unit: record.unit_no ? `${record.unit_type || 'Flat'} ${record.unit_no}` : null,
      project: (record.project_name as string) || 'Anandam',
      applicant: formatPersonName(record.applicant_salutation as string, record.applicant_name as string) || null,
      mobile: (record.applicant_mobile as string) || null,
      price: price != null && price > 0n ? hundredthsToString(price) : null,
      completed: Object.values(checks).filter(Boolean).length,
      missing: Object.entries(checks).filter(([, done]) => !done).map(([name]) => name),
    }
  })

  return (
    <DashboardLayout profile={profile}>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-semibold text-zinc-900">Drafts</h1>
          <p className="mt-1 text-zinc-600">
            Bookings that have been started but not submitted. Drafts are saved to the database automatically while you fill in the form.
          </p>
        </div>
        {error ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Drafts could not be loaded: {error.message}</p>
        ) : (
          <DraftsList rows={rows} showCreator={isAdmin} />
        )}
      </div>
    </DashboardLayout>
  )
}
