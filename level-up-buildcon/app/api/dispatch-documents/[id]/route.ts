import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const profile = await requireProfile()
    if (!profile || !['ACCOUNTS', 'ADMIN'].includes(profile.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { id } = await params
    const supabase = await createClient()

    // Get document record
    const { data: doc, error } = await supabase
      .from('booking_dispatch_documents')
      .select('file_path, file_name, mime_type')
      .eq('id', id)
      .single()

    if (error || !doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Get signed URL
    const { data: urlData } = await supabase.storage
      .from('dispatch-documents')
      .createSignedUrl(doc.file_path, 3600)

    if (!urlData?.signedUrl) {
      return NextResponse.json({ error: 'Failed to generate URL' }, { status: 500 })
    }

    // Redirect to signed URL
    return NextResponse.redirect(urlData.signedUrl)
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
