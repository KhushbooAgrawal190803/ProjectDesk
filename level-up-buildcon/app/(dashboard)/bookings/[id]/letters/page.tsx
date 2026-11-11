import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireStaffPage } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { assertCanDownloadPdfs } from '@/lib/auth/permissions'
import { loadExtrasForBookings } from '@/lib/booking/persist-details'
import { buildLetter, type LetterKind } from '@/lib/documents/letter-model'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Download } from 'lucide-react'

export default async function LetterPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ kind?: string }>
}) {
  const { id } = await params
  const { kind: requested } = await searchParams
  const kind: LetterKind = requested === 'noc' ? 'noc' : 'allotment'
  const profile = await requireStaffPage()
  const supabase = await createClient()

  const { data: booking } = await supabase.from('bookings').select('*').eq('id', id).single()
  if (!booking) notFound()
  assertCanDownloadPdfs(profile, booking)

  const extras = (await loadExtrasForBookings(supabase, [booking.id])).get(booking.id)
  const letter = buildLetter({ ...booking, ...extras }, kind)
  const title = kind === 'noc' ? 'NOC preview' : 'Allotment letter preview'
  const previewUrl = `/api/bookings/${id}/letters?kind=${kind}`
  const downloadUrl = `${previewUrl}&download=1`

  return (
    <DashboardLayout profile={profile}>
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">{title}</h1>
            <p className="text-sm text-zinc-600">
              {booking.serial_display || 'Booking'} · Flat {booking.unit_no}
              {letter.owner === 'LANDOWNER' ? ' · Landowner share' : letter.owner === 'DEVELOPER' ? ' · Developer share' : ''}
            </p>
          </div>
          <div className="flex gap-2">
            <Link href={`/bookings/${id}`}>
              <Button variant="outline" className="gap-2">
                <ArrowLeft className="w-4 h-4" />
                Booking
              </Button>
            </Link>
            {letter.issues.length === 0 && (
              <a href={downloadUrl}>
                <Button className="gap-2">
                  <Download className="w-4 h-4" />
                  Download
                </Button>
              </a>
            )}
          </div>
        </div>

        {letter.issues.length > 0 ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
            <p className="font-medium">This letter is not ready. Nothing below has been invented.</p>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              {letter.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
        ) : (
          <iframe title={title} src={previewUrl} className="w-full h-[80vh] rounded-lg border border-zinc-200 bg-white" />
        )}
      </div>
    </DashboardLayout>
  )
}
