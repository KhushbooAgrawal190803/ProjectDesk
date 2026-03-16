'use server'

import { requireProfile } from '@/lib/auth/get-user'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { DocumentType } from '@/lib/types/database'

export async function uploadDocument(
  formData: FormData
): Promise<{ success: boolean; documentId?: string; error?: string }> {
  try {
    const profile = await requireProfile()
    const supabase = await createClient()

    const file = formData.get('file') as File
    const bookingId = formData.get('bookingId') as string
    const documentType = formData.get('documentType') as DocumentType

    if (!file || !documentType) {
      return { success: false, error: 'File and document type are required' }
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    if (!allowedTypes.includes(file.type)) {
      return { success: false, error: 'Only JPG, PNG, WebP, or PDF files are allowed' }
    }

    // Validate file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      return { success: false, error: 'File size must be less than 10MB' }
    }

    // Generate a unique file path
    const ext = file.name.split('.').pop() || 'pdf'
    const timestamp = Date.now()
    const storagePath = `${profile.id}/${documentType}_${timestamp}.${ext}`

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('booking-documents')
      .upload(storagePath, file, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      console.error('Storage upload error:', uploadError.message)
      return { success: false, error: `Upload failed: ${uploadError.message}` }
    }

    // Insert record into booking_documents table
    const docRecord: any = {
      document_type: documentType,
      file_name: file.name,
      file_path: storagePath,
      file_size: file.size,
      mime_type: file.type,
      uploaded_by: profile.id,
    }

    // If bookingId is provided (editing existing booking), link it
    if (bookingId && bookingId !== 'pending') {
      docRecord.booking_id = bookingId
    }

    const { data: doc, error: dbError } = await supabase
      .from('booking_documents')
      .insert(docRecord)
      .select()
      .single()

    if (dbError) {
      console.error('DB insert error:', dbError.message)
      // Clean up uploaded file
      await supabase.storage.from('booking-documents').remove([storagePath])
      return { success: false, error: `Failed to save document record: ${dbError.message}` }
    }

    return { success: true, documentId: doc.id }
  } catch (error: any) {
    console.error('Upload document error:', error.message)
    return { success: false, error: error.message }
  }
}

export async function deleteDocument(documentId: string) {
  try {
    const profile = await requireProfile()
    const supabase = await createClient()

    // Get the document to find the file path
    const { data: doc, error: fetchError } = await supabase
      .from('booking_documents')
      .select('*')
      .eq('id', documentId)
      .eq('uploaded_by', profile.id)
      .single()

    if (fetchError || !doc) {
      return { success: false, error: 'Document not found' }
    }

    // Delete from storage
    await supabase.storage.from('booking-documents').remove([doc.file_path])

    // Delete from database
    const { error: dbError } = await supabase
      .from('booking_documents')
      .delete()
      .eq('id', documentId)

    if (dbError) {
      return { success: false, error: 'Failed to delete document record' }
    }

    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function linkDocumentsToBooking(documentIds: string[], bookingId: string) {
  try {
    const profile = await requireProfile()
    const supabase = await createServiceClient()

    for (const docId of documentIds) {
      const { error } = await supabase
        .from('booking_documents')
        .update({ booking_id: bookingId })
        .eq('id', docId)
        .eq('uploaded_by', profile.id)

      if (error) {
        console.error('Link document error:', error.message)
      }
    }

    return { success: true }
  } catch (error: any) {
    console.error('linkDocumentsToBooking error:', error.message)
    return { success: false, error: error.message }
  }
}

export async function getBookingDocuments(bookingId: string) {
  const profile = await requireProfile()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('booking_documents')
    .select('*')
    .eq('booking_id', bookingId)
    .order('created_at')

  if (error) return []
  return data
}

export async function getDraftDocuments(draftId?: string) {
  const profile = await requireProfile()
  const supabase = await createClient()

  // Fetch documents that belong to this draft or are unlinked (uploaded by this user)
  let query = supabase
    .from('booking_documents')
    .select('*')
    .eq('uploaded_by', profile.id)
    .order('created_at')

  if (draftId) {
    query = query.or(`booking_id.eq.${draftId},booking_id.is.null`)
  } else {
    query = query.is('booking_id', null)
  }

  const { data, error } = await query
  if (error) return []
  return data
}
