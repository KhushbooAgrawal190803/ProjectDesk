'use server'

import { requireStaff } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { randomUUID } from 'crypto'
import { DocumentType } from '@/lib/types/database'

const DOCUMENT_TYPES: DocumentType[] = ['applicant_pan', 'applicant_aadhaar', 'coapplicant_pan', 'coapplicant_aadhaar']
const EXTENSIONS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' }
const MAX_BYTES = 10 * 1024 * 1024
const BUCKET = 'booking-documents'

/** The first bytes of each allowed type, so a renamed file is not accepted. */
function matchesType(head: Uint8Array, mime: string): boolean {
  const text = (start: number, value: string) => [...value].every((char, index) => head[start + index] === char.charCodeAt(0))
  if (mime === 'application/pdf') return text(0, '%PDF-')
  if (mime === 'image/png') return head[0] === 0x89 && text(1, 'PNG')
  if (mime === 'image/jpeg') return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff
  if (mime === 'image/webp') return text(0, 'RIFF') && text(8, 'WEBP')
  return false
}

/**
 * Step 1 of an upload: a one-time signed URL for a path in the user's own folder.
 * The browser sends the file straight to private storage, so large scans never pass
 * through the app server (Vercel accepts at most 4.5 MB per request).
 */
export async function createDocumentUpload(input: {
  documentType: DocumentType
  fileName: string
  fileSize: number
  mimeType: string
}): Promise<{ success: true; path: string; token: string } | { success: false; error: string }> {
  try {
    const profile = await requireStaff()
    const supabase = await createClient()
    if (!DOCUMENT_TYPES.includes(input.documentType)) return { success: false, error: 'Unknown document type' }
    const extension = EXTENSIONS[input.mimeType]
    if (!extension) return { success: false, error: 'Only JPG, PNG, WebP, or PDF files are allowed' }
    if (!Number.isFinite(input.fileSize) || input.fileSize <= 0 || input.fileSize > MAX_BYTES) {
      return { success: false, error: 'File size must be less than 10MB' }
    }
    const path = `${profile.id}/${input.documentType}_${Date.now()}_${randomUUID().slice(0, 8)}.${extension}`
    // The storage policy allows a user to write only inside their own folder.
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path)
    if (error || !data) return { success: false, error: `Upload could not start: ${error?.message || 'no upload URL'}` }
    return { success: true, path: data.path, token: data.token }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Upload could not start' }
  }
}

/**
 * Step 2: after the browser upload, check the stored file itself (owner, size, real type)
 * and record it. A file that fails a check is deleted from storage.
 */
export async function confirmDocumentUpload(input: {
  path: string
  documentType: DocumentType
  fileName: string
  bookingId?: string | null
}): Promise<{ success: boolean; documentId?: string; error?: string }> {
  try {
    const profile = await requireStaff()
    const supabase = await createClient()
    if (!DOCUMENT_TYPES.includes(input.documentType)) return { success: false, error: 'Unknown document type' }
    const folder = `${profile.id}/`
    if (!input.path.startsWith(folder) || input.path.includes('..') || input.path.slice(folder.length).includes('/')) {
      return { success: false, error: 'This upload does not belong to you' }
    }
    const extension = input.path.split('.').pop() || ''
    const mime = Object.entries(EXTENSIONS).find(([, ext]) => ext === extension)?.[0]
    if (!mime) return { success: false, error: 'Unknown file type' }

    const name = input.path.slice(folder.length)
    const { data: listed } = await supabase.storage.from(BUCKET).list(profile.id, { search: name, limit: 1 })
    const stored = listed?.find((item) => item.name === name)
    const size = Number(stored?.metadata?.size ?? NaN)
    if (!stored || !Number.isFinite(size)) return { success: false, error: 'The uploaded file was not found. Please upload it again.' }
    const reject = async (message: string) => {
      await supabase.storage.from(BUCKET).remove([input.path])
      return { success: false, error: message }
    }
    if (size > MAX_BYTES) return reject('File size must be less than 10MB')
    // Only the first bytes are read to check the real file type.
    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(input.path, 60)
    const headResponse = signed?.signedUrl ? await fetch(signed.signedUrl, { headers: { Range: 'bytes=0-15' } }) : null
    if (!headResponse?.ok) return reject('The uploaded file could not be read. Please upload it again.')
    const head = new Uint8Array(await headResponse.arrayBuffer()).slice(0, 16)
    if (!matchesType(head, mime)) return reject('The file content does not match a JPG, PNG, WebP, or PDF file')

    const docRecord: Record<string, unknown> = {
      document_type: input.documentType,
      file_name: String(input.fileName || `document.${extension}`).slice(0, 200),
      file_path: input.path,
      file_size: size,
      mime_type: mime,
      uploaded_by: profile.id,
    }
    if (input.bookingId && input.bookingId !== 'pending') docRecord.booking_id = input.bookingId

    const { data: doc, error: dbError } = await supabase.from('booking_documents').insert(docRecord).select('id').single()
    if (dbError || !doc) {
      await supabase.storage.from(BUCKET).remove([input.path])
      return { success: false, error: `Failed to save document record: ${dbError?.message || 'unknown error'}` }
    }
    return { success: true, documentId: doc.id }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Upload could not be saved' }
  }
}

export async function deleteDocument(documentId: string) {
  try {
    const profile = await requireStaff()
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
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to delete document' }
  }
}

export async function linkDocumentsToBooking(
  documentIds: string[],
  bookingId: string,
  coapplicantByDocument: Record<string, string | null> = {}
) {
  try {
    const profile = await requireStaff()
    const supabase = await createClient()

    for (const docId of documentIds) {
      const coapplicantId = coapplicantByDocument[docId]
      const { error } = await supabase
        .from('booking_documents')
        .update({
          booking_id: bookingId,
          ...(coapplicantId ? { coapplicant_id: coapplicantId } : {}),
        })
        .eq('id', docId)
        .eq('uploaded_by', profile.id)

      if (error) {
        console.error('Link document error:', error.message)
      }
    }

    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to link documents'
    console.error('linkDocumentsToBooking error:', message)
    return { success: false, error: message }
  }
}

export async function getBookingDocuments(bookingId: string) {
  const profile = await requireStaff()
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
  const profile = await requireStaff()
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
