import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyPackageLink } from '@/lib/email/config'
import { EMAIL_BUCKET } from '@/lib/email/supabase-store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The secure link in a large-package email. The signature and expiry are checked, then
 * the browser is sent to a one-minute signed URL for the private file. Nothing is public.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const expires = request.nextUrl.searchParams.get('expires')
  const signature = request.nextUrl.searchParams.get('sig')
  if (!UUID.test(eventId) || !verifyPackageLink(eventId, expires, signature)) {
    return NextResponse.json({ error: 'This download link is invalid or has expired.' }, { status: 403 })
  }
  const service = await createServiceClient()
  const { data: event } = await service.from('email_events').select('package_path, package_expires_at, delivery_mode').eq('id', eventId).maybeSingle()
  if (!event?.package_path || event.delivery_mode !== 'link') return NextResponse.json({ error: 'Package not found' }, { status: 404 })
  if (event.package_expires_at && new Date(event.package_expires_at) < new Date()) {
    return NextResponse.json({ error: 'This download link has expired.' }, { status: 410 })
  }
  const { data, error } = await service.storage.from(EMAIL_BUCKET).createSignedUrl(event.package_path, 60, { download: `ANANDAM-documents-${eventId.slice(0, 8)}.zip` })
  if (error || !data?.signedUrl) return NextResponse.json({ error: 'The package could not be opened' }, { status: 500 })
  return NextResponse.redirect(data.signedUrl, { headers: { 'Cache-Control': 'no-store' } })
}
