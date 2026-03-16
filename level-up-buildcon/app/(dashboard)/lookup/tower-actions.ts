'use server'

import { requireProfile } from '@/lib/auth/get-user'
import { createServiceClient } from '@/lib/supabase/server'

export interface AllocatedUnit {
  unit_no: string
  applicant_name: string
  serial_display: string | null
  booking_id: string
  status: string
}

export async function getTowerAllocations(): Promise<AllocatedUnit[]> {
  await requireProfile()
  const supabase = await createServiceClient()

  // Base query — fetch all non-draft Anandam bookings
  let query = supabase
    .from('bookings')
    .select('id, unit_no, applicant_name, serial_display, status')
    .eq('project_name', 'Anandam')
    .neq('status', 'DRAFT')

  // Apply soft-delete filter only if the column exists
  try {
    const probe = await supabase
      .from('bookings')
      .select('deleted_at')
      .limit(0)
    if (!probe.error) {
      query = query.is('deleted_at', null) as typeof query
    }
  } catch { /* column doesn't exist — skip filter */ }

  const { data } = await query

  return (data || []).map(b => ({
    unit_no: String(b.unit_no),
    applicant_name: b.applicant_name,
    serial_display: b.serial_display,
    booking_id: b.id,
    status: b.status,
  }))
}
