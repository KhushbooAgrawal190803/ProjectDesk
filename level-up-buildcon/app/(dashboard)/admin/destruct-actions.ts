'use server'

import { requireRole } from '@/lib/auth/get-user'
import { createServiceClient } from '@/lib/supabase/server'

export async function runDestruct(password: string) {
  const profile = await requireRole(['ADMIN'])

  const expected = process.env.DESTRUCT_PASSWORD
  if (!expected) {
    throw new Error('Destruct password is not configured on the server')
  }
  if (password !== expected) {
    throw new Error('Invalid destruct password')
  }

  const supabase = await createServiceClient()

  // Delete all bookings (cascades to booking_files, booking_payment_slabs, booking_audit_log)
  const { error } = await supabase
    .from('bookings')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000') // dummy condition to satisfy PostgREST

  if (error) {
    throw new Error(`Failed to delete bookings: ${error.message}`)
  }

  // Optional: clear admin audit log as part of destruct
  await supabase.from('admin_audit_log').delete().neq('id', '00000000-0000-0000-0000-000000000000')

  return { success: true, deletedBy: profile.email }
}

