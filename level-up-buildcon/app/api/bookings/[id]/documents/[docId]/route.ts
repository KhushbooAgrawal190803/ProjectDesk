import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    const { id, docId } = await params
    const profile = await requireProfile()
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = await createClient()

    // Fetch the document record
    const { data: doc, error } = await supabase
      .from('booking_documents')
      .select('*')
      .eq('id', docId)
      .eq('booking_id', id)
      .single()

    if (error || !doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Get signed URL and redirect to it
    const { data: signedData } = await supabase.storage
      .from('booking-documents')
      .createSignedUrl(doc.file_path, 3600)

    if (!signedData?.signedUrl) {
      return NextResponse.json({ error: 'Failed to generate download URL' }, { status: 500 })
    }

    return NextResponse.redirect(signedData.signedUrl)
  } catch (error: any) {
    console.error('Document download error:', error.message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
