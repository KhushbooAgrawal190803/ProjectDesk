import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireStaffPage } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { assertCanDownloadPdfs } from '@/lib/auth/permissions'
import { loadBookingExtras } from '@/lib/booking/persist-details'
import { agreementReadiness } from '@/lib/documents/agreement-ready'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Button } from '@/components/ui/button'

export default async function AgreementPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await requireStaffPage()
  const supabase = await createClient()
  const { data: booking } = await supabase.from('bookings').select('*').eq('id', id).single()
  if (!booking) notFound()
  assertCanDownloadPdfs(profile, booking)
  const extras = await loadBookingExtras(supabase, booking.id)
  const ready = agreementReadiness(booking, {
    coapplicants: extras.coapplicants,
    payments: extras.payment_entries,
    schedule: extras.schedule_rows,
  })
  const { data: frozen } = await supabase
    .from('booking_generated_documents')
    .select('version')
    .eq('booking_id', id)
    .eq('kind', 'agreement')
    .eq('finalized', true)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  const preview = frozen ? '' : '&preview=1'

  return (
    <DashboardLayout profile={profile}>
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">Agreement preview</h1>
            <p className="text-sm text-zinc-500">
              {frozen ? `Showing finalized version ${frozen.version}.` : 'This preview is not frozen yet.'}
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline"><Link href={`/bookings/${id}`}>Back</Link></Button>
            <Button asChild variant="outline"><a href={`/api/bookings/${id}/agreement?format=docx&download=1${preview}`}>Word</a></Button>
            <Button asChild variant="outline"><a href={`/api/bookings/${id}/agreement?format=pdf&download=1${preview}`}>PDF</a></Button>
          </div>
        </div>
        {ready.issues.length > 0 && !frozen ? (
          <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-700">
            {ready.issues.map((issue) => <li key={issue}>{issue}</li>)}
          </ul>
        ) : (
          <>
            {ready.warnings.length > 0 && !frozen && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <p className="font-medium">Check these before finalizing</p>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {ready.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
              </div>
            )}
            <iframe title="Agreement preview" src={`/api/bookings/${id}/agreement?format=pdf${preview}`} className="h-[80vh] w-full rounded-lg border border-zinc-200 bg-white" />
          </>
        )}
      </div>
    </DashboardLayout>
  )
}
