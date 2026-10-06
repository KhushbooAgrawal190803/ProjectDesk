'use server'

import { requireStaff } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'

export interface AllocatedUnit {
  unit_no: string
  applicant_name: string
  serial_display: string | null
  booking_id: string
  status: string
}

export async function getTowerAllocations(): Promise<AllocatedUnit[]> {
  await requireStaff()
  const supabase = await createClient()

  const { data } = await supabase
    .from('bookings')
    .select('id, unit_no, applicant_name, serial_display, status')
    .eq('project_name', 'Anandam')
    .neq('status', 'DRAFT')
    .is('deleted_at', null)

  return (data || []).map((b) => ({
    unit_no: String(b.unit_no),
    applicant_name: b.applicant_name,
    serial_display: b.serial_display,
    booking_id: b.id,
    status: b.status,
  }))
}
