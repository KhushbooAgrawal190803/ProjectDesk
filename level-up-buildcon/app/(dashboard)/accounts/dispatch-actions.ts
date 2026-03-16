'use server'

import { requireRole } from '@/lib/auth/get-user'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { DispatchStatus } from '@/lib/types/database'
import { sendEmail, buildDispatchEmailHtml, isEmailConfigured } from '@/lib/email'
import { sendWhatsApp, buildDispatchWhatsAppMessage, isWhatsAppConfigured } from '@/lib/whatsapp'

export async function getDispatchDocuments(bookingId?: string) {
  const profile = await requireRole(['ACCOUNTS', 'ADMIN'])
  const supabase = await createClient()

  let query = supabase
    .from('booking_dispatch_documents')
    .select(`
      *,
      uploader:profiles!uploaded_by(full_name, email),
      approver:profiles!approved_by(full_name, email),
      booking:bookings!booking_id(serial_display, applicant_name, applicant_mobile, applicant_email)
    `)
    .order('created_at', { ascending: false })

  if (bookingId) {
    query = query.eq('booking_id', bookingId)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Failed to fetch dispatch documents: ${error.message}`)
  }

  return data || []
}

export async function getPendingDispatches() {
  const profile = await requireRole(['ADMIN'])
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('booking_dispatch_documents')
    .select(`
      *,
      uploader:profiles!uploaded_by(full_name, email),
      booking:bookings!booking_id(serial_display, applicant_name, applicant_mobile, applicant_email)
    `)
    .eq('status', 'PENDING')
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to fetch pending dispatches: ${error.message}`)
  }

  return data || []
}

export async function uploadDispatchDocument(formData: FormData) {
  const profile = await requireRole(['ACCOUNTS', 'ADMIN'])
  const supabase = await createClient()

  const bookingId = formData.get('bookingId') as string
  const copyType = formData.get('copyType') as 'customer' | 'company'
  const file = formData.get('file') as File
  const recipientEmail = formData.get('recipientEmail') as string
  const recipientPhone = formData.get('recipientPhone') as string

  if (!bookingId || !copyType || !file) {
    throw new Error('Missing required fields')
  }

  // Upload file to storage
  const fileExt = file.name.split('.').pop()
  const fileName = `${bookingId}/${copyType}_${Date.now()}.${fileExt}`

  const { error: uploadError } = await supabase.storage
    .from('dispatch-documents')
    .upload(fileName, file)

  if (uploadError) {
    throw new Error(`Failed to upload file: ${uploadError.message}`)
  }

  // Create dispatch document record
  const { data, error } = await supabase
    .from('booking_dispatch_documents')
    .insert({
      booking_id: bookingId,
      copy_type: copyType,
      file_name: file.name,
      file_path: fileName,
      file_size: file.size,
      mime_type: file.type,
      recipient_email: recipientEmail || null,
      recipient_phone: recipientPhone || null,
      status: 'PENDING',
      uploaded_by: profile.id,
    })
    .select()
    .single()

  if (error) {
    // Cleanup uploaded file on failure
    await supabase.storage.from('dispatch-documents').remove([fileName])
    throw new Error(`Failed to create dispatch record: ${error.message}`)
  }

  revalidatePath('/accounts')
  revalidatePath('/admin')
  return { success: true, document: data }
}

export async function approveDispatchDocument(documentId: string) {
  const profile = await requireRole(['ADMIN'])
  const supabase = await createClient()

  // Get the document details
  const { data: doc, error: getError } = await supabase
    .from('booking_dispatch_documents')
    .select(`
      *,
      booking:bookings!booking_id(serial_display, applicant_name, applicant_mobile, applicant_email)
    `)
    .eq('id', documentId)
    .single()

  if (getError || !doc) {
    throw new Error('Dispatch document not found')
  }

  if (doc.status !== 'PENDING') {
    throw new Error('Document is not in pending status')
  }

  // Update status to APPROVED
  const { error: updateError } = await supabase
    .from('booking_dispatch_documents')
    .update({
      status: 'APPROVED',
      approved_by: profile.id,
      approved_at: new Date().toISOString(),
    })
    .eq('id', documentId)

  if (updateError) {
    throw new Error(`Failed to approve document: ${updateError.message}`)
  }

  // ===== AUTO-SEND VIA EMAIL & WHATSAPP =====
  // Get signed URL for the document
  const serviceSupabase = await createServiceClient()
  const { data: urlData } = await serviceSupabase.storage
    .from('dispatch-documents')
    .createSignedUrl(doc.file_path, 7 * 24 * 3600) // 7 day link

  const documentUrl = urlData?.signedUrl

  let emailSent = false
  let whatsappSent = false

  // Send email via SMTP (nodemailer)
  if (doc.recipient_email && documentUrl) {
    const applicantName = doc.booking?.applicant_name || 'Customer'
    const serialDisplay = doc.booking?.serial_display || 'N/A'
    const copyType = doc.copy_type === 'customer' ? 'Customer' : 'Company'

    emailSent = await sendEmail({
      to: doc.recipient_email,
      subject: `Booking Document (${copyType} Copy) — ${serialDisplay} | Level Up Buildcon`,
      html: buildDispatchEmailHtml({
        applicantName,
        serialDisplay,
        copyType,
        documentUrl,
      }),
      attachmentUrl: documentUrl,
      attachmentName: doc.file_name,
    })
  }

  // Send WhatsApp via Twilio
  if (doc.recipient_phone && documentUrl) {
    const applicantName = doc.booking?.applicant_name || 'Customer'
    const serialDisplay = doc.booking?.serial_display || 'N/A'
    const copyType = doc.copy_type === 'customer' ? 'Customer' : 'Company'

    whatsappSent = await sendWhatsApp({
      to: doc.recipient_phone,
      message: buildDispatchWhatsAppMessage({
        applicantName,
        serialDisplay,
        copyType,
        documentUrl,
      }),
      mediaUrl: documentUrl,
    })
  }

  // Update sending timestamps
  const sendUpdate: Record<string, any> = { status: 'SENT' as DispatchStatus }
  if (emailSent) sendUpdate.email_sent_at = new Date().toISOString()
  if (whatsappSent) sendUpdate.whatsapp_sent_at = new Date().toISOString()

  await supabase
    .from('booking_dispatch_documents')
    .update(sendUpdate)
    .eq('id', documentId)

  // Log the action
  await supabase
    .from('admin_audit_log')
    .insert({
      admin_id: profile.id,
      action: 'DISPATCH_APPROVED',
      details: {
        document_id: documentId,
        booking_id: doc.booking_id,
        copy_type: doc.copy_type,
        recipient_email: doc.recipient_email,
        recipient_phone: doc.recipient_phone,
        email_sent: emailSent,
        whatsapp_sent: whatsappSent,
      },
    })

  revalidatePath('/accounts')
  revalidatePath('/admin')
  return { success: true, emailSent, whatsappSent }
}

export async function rejectDispatchDocument(documentId: string, reason: string) {
  const profile = await requireRole(['ADMIN'])
  const supabase = await createClient()

  const { data: doc, error: getError } = await supabase
    .from('booking_dispatch_documents')
    .select('id, status')
    .eq('id', documentId)
    .single()

  if (getError || !doc) {
    throw new Error('Dispatch document not found')
  }

  if (doc.status !== 'PENDING') {
    throw new Error('Document is not in pending status')
  }

  const { error: updateError } = await supabase
    .from('booking_dispatch_documents')
    .update({
      status: 'REJECTED',
      approved_by: profile.id,
      approved_at: new Date().toISOString(),
      rejection_reason: reason,
    })
    .eq('id', documentId)

  if (updateError) {
    throw new Error(`Failed to reject document: ${updateError.message}`)
  }

  revalidatePath('/accounts')
  revalidatePath('/admin')
  return { success: true }
}

export async function deleteDispatchDocument(documentId: string) {
  const profile = await requireRole(['ADMIN'])
  const serviceSupabase = await createServiceClient()

  // Get the document to find file path
  const { data: doc, error: getError } = await serviceSupabase
    .from('booking_dispatch_documents')
    .select('file_path')
    .eq('id', documentId)
    .single()

  if (getError || !doc) {
    throw new Error('Document not found')
  }

  // Delete from storage
  await serviceSupabase.storage.from('dispatch-documents').remove([doc.file_path])

  // Delete record
  const { error } = await serviceSupabase
    .from('booking_dispatch_documents')
    .delete()
    .eq('id', documentId)

  if (error) {
    throw new Error(`Failed to delete dispatch document: ${error.message}`)
  }

  revalidatePath('/accounts')
  revalidatePath('/admin')
  return { success: true }
}

export async function getBookingsForDispatch() {
  const profile = await requireRole(['ACCOUNTS', 'ADMIN'])
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('bookings')
    .select('id, serial_display, applicant_name, applicant_mobile, applicant_email, unit_no, project_name')
    .in('status', ['SUBMITTED', 'EDITED'])
    .is('deleted_at', null)
    .order('submitted_at', { ascending: false })

  if (error) {
    throw new Error('Failed to fetch bookings')
  }

  return data || []
}
