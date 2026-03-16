'use server'

import { requireRole } from '@/lib/auth/get-user'
import { createServiceClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email'

const ACCOUNTS_BCC = process.env.ACCOUNTS_EMAIL || process.env.SMTP_USER || ''

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
export interface SlabWithStats {
  id: number
  sr_no: number
  label: string
  percentage: number
  total: number
  paid: number
  unpaid: number
}

export interface ReminderBooking {
  id: string
  serial_display: string | null
  applicant_name: string | null
  applicant_email: string | null
  applicant_mobile: string | null
  unit_no: string | null
  project_name: string | null
  total_cost: number
  amount_due: number
  amount_received: number
  received_at: string | null
  last_reminder_sent_at: string | null
}

// ─────────────────────────────────────────────
// Fetch slabs with booking stats
// ─────────────────────────────────────────────
export async function getSlabsWithStats(): Promise<SlabWithStats[]> {
  await requireRole(['ACCOUNTS', 'ADMIN'])
  const supabase = await createServiceClient()

  const { data: slabs } = await supabase
    .from('payment_slabs')
    .select('id, sr_no, label, percentage')
    .order('sr_no')

  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, total_cost')
    .in('status', ['SUBMITTED', 'EDITED'])
    .is('deleted_at', null)

  const { data: payments } = await supabase
    .from('booking_payment_slabs')
    .select('slab_id, amount_due, amount_received')

  const bookingIds = new Set((bookings || []).map((b: any) => b.id))
  const paymentMap = new Map<number, { due: number; received: number }>()
  for (const p of payments || []) {
    const cur = paymentMap.get(p.slab_id) || { due: 0, received: 0 }
    paymentMap.set(p.slab_id, {
      due: cur.due + Number(p.amount_due),
      received: cur.received + Number(p.amount_received),
    })
  }

  const total = (bookings || []).length

  return (slabs || []).map((s: any) => {
    const pm = paymentMap.get(s.id) || { due: 0, received: 0 }
    const paidCount = (payments || []).filter(
      (p: any) => p.slab_id === s.id && Number(p.amount_received) >= Number(p.amount_due)
    ).length
    return {
      id: s.id,
      sr_no: s.sr_no,
      label: s.label,
      percentage: s.percentage,
      total,
      paid: paidCount,
      unpaid: total - paidCount,
    }
  })
}

// ─────────────────────────────────────────────
// Fetch bookings for a slab
// ─────────────────────────────────────────────
export async function getSlabBookings(slabId: number): Promise<ReminderBooking[]> {
  await requireRole(['ACCOUNTS', 'ADMIN'])
  const supabase = await createServiceClient()

  const { data: slab } = await supabase
    .from('payment_slabs')
    .select('id, percentage')
    .eq('id', slabId)
    .single()

  if (!slab) return []

  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, serial_display, applicant_name, applicant_email, applicant_mobile, unit_no, project_name, total_cost')
    .in('status', ['SUBMITTED', 'EDITED'])
    .is('deleted_at', null)
    .order('serial_no', { ascending: true })

  const { data: payments } = await supabase
    .from('booking_payment_slabs')
    .select('booking_id, amount_due, amount_received, received_at, last_reminder_sent_at')
    .eq('slab_id', slabId)

  const payMap = new Map((payments || []).map((p: any) => [p.booking_id, p]))

  return (bookings || []).map((b: any) => {
    const totalCost = Number(b.total_cost) || 0
    const amountDue = (totalCost * Number(slab.percentage)) / 100
    const p = payMap.get(b.id)
    return {
      id: b.id,
      serial_display: b.serial_display,
      applicant_name: b.applicant_name,
      applicant_email: b.applicant_email,
      applicant_mobile: b.applicant_mobile,
      unit_no: b.unit_no,
      project_name: b.project_name,
      total_cost: totalCost,
      amount_due: p ? Number(p.amount_due) : amountDue,
      amount_received: p ? Number(p.amount_received) : 0,
      received_at: p?.received_at || null,
      last_reminder_sent_at: p?.last_reminder_sent_at || null,
    }
  })
}

// ─────────────────────────────────────────────
// Build reminder email HTML
// ─────────────────────────────────────────────
function buildReminderHtml(params: {
  applicantName: string
  unitNo: string
  projectName: string
  slabLabel: string
  slabPercentage: number
  amountDue: number
  amountReceived: number
  serialDisplay: string
}): string {
  const balance = params.amountDue - params.amountReceived
  const fmt = (n: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)

  return `
    <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; color: #1a1a1a;">
      <div style="background: #1a1a1a; color: white; padding: 24px 28px; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0; font-size: 20px; letter-spacing: 0.5px;">LEVEL UP BUILDCON</h1>
        <p style="margin: 4px 0 0; font-size: 12px; color: #aaa;">Payment Reminder</p>
      </div>
      <div style="background: #fafafa; padding: 28px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        <p style="font-size: 15px; margin-bottom: 8px;">Dear <strong>${params.applicantName}</strong>,</p>
        <p style="font-size: 14px; color: #555; line-height: 1.6;">
          This is a friendly reminder regarding the payment due for your property booking at
          <strong>${params.projectName}</strong>.
        </p>

        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
          <tr style="background: #f3f4f6;">
            <td style="padding: 8px 12px; font-weight: 600; border: 1px solid #e5e7eb;">Booking Serial</td>
            <td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${params.serialDisplay || '—'}</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; font-weight: 600; border: 1px solid #e5e7eb;">Unit No.</td>
            <td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${params.unitNo || '—'}</td>
          </tr>
          <tr style="background: #f3f4f6;">
            <td style="padding: 8px 12px; font-weight: 600; border: 1px solid #e5e7eb;">Payment Milestone</td>
            <td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${params.slabLabel}</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; font-weight: 600; border: 1px solid #e5e7eb;">Amount Due</td>
            <td style="padding: 8px 12px; border: 1px solid #e5e7eb; font-weight: 700;">${fmt(params.amountDue)}</td>
          </tr>
          ${params.amountReceived > 0 ? `
          <tr style="background: #f0fdf4;">
            <td style="padding: 8px 12px; font-weight: 600; border: 1px solid #e5e7eb;">Amount Received</td>
            <td style="padding: 8px 12px; border: 1px solid #e5e7eb; color: #16a34a;">${fmt(params.amountReceived)}</td>
          </tr>
          <tr style="background: #fef2f2;">
            <td style="padding: 8px 12px; font-weight: 700; border: 1px solid #e5e7eb; color: #dc2626;">Balance Payable</td>
            <td style="padding: 8px 12px; border: 1px solid #e5e7eb; font-weight: 700; color: #dc2626;">${fmt(balance)}</td>
          </tr>
          ` : ''}
        </table>

        <p style="font-size: 14px; color: #555; line-height: 1.6;">
          We request you to please make the payment at your earliest convenience.
          For any queries, please reach out to us.
        </p>

        <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #888;">
          <p style="margin: 0;"><strong>Level Up Buildcon</strong></p>
          <p style="margin: 4px 0 0;">Plot No 1089, Khata No 74, Gutuwa Nagri, Ranchi, Jharkhand</p>
        </div>
      </div>
    </div>
  `
}

// ─────────────────────────────────────────────
// Send reminder for a single booking
// ─────────────────────────────────────────────
export async function sendPaymentReminder(
  bookingId: string,
  slabId: number
): Promise<{ success: boolean; message: string }> {
  await requireRole(['ACCOUNTS', 'ADMIN'])
  const supabase = await createServiceClient()

  const [bookingRes, slabRes] = await Promise.all([
    supabase.from('bookings').select('*').eq('id', bookingId).single(),
    supabase.from('payment_slabs').select('*').eq('id', slabId).single(),
  ])

  const booking = bookingRes.data
  const slab = slabRes.data

  if (!booking || !slab) return { success: false, message: 'Booking or slab not found' }
  if (!booking.applicant_email) return { success: false, message: 'No email address on this booking' }

  const totalCost = Number(booking.total_cost) || 0
  const amountDue = (totalCost * Number(slab.percentage)) / 100

  const { data: payRow } = await supabase
    .from('booking_payment_slabs')
    .select('amount_received')
    .eq('booking_id', bookingId)
    .eq('slab_id', slabId)
    .maybeSingle()

  const amountReceived = payRow ? Number(payRow.amount_received) : 0

  const html = buildReminderHtml({
    applicantName: booking.applicant_name || 'Customer',
    unitNo: booking.unit_no || '—',
    projectName: booking.project_name || 'Anandam',
    slabLabel: slab.label,
    slabPercentage: slab.percentage,
    amountDue,
    amountReceived,
    serialDisplay: booking.serial_display || '',
  })

  const sent = await sendEmail({
    to: booking.applicant_email,
    bcc: ACCOUNTS_BCC || undefined,
    subject: `Payment Reminder — ${slab.label} | ${booking.serial_display || 'Level Up Buildcon'}`,
    html,
  })

  if (sent) {
    // Update / upsert last_reminder_sent_at
    const { data: existing } = await supabase
      .from('booking_payment_slabs')
      .select('id')
      .eq('booking_id', bookingId)
      .eq('slab_id', slabId)
      .maybeSingle()

    if (existing) {
      await supabase
        .from('booking_payment_slabs')
        .update({ last_reminder_sent_at: new Date().toISOString() })
        .eq('id', (existing as any).id)
    } else {
      await supabase.from('booking_payment_slabs').insert({
        booking_id: bookingId,
        slab_id: slabId,
        amount_due: amountDue,
        amount_received: 0,
        last_reminder_sent_at: new Date().toISOString(),
      })
    }
  }

  return { success: sent, message: sent ? 'Reminder sent' : 'Email not configured — check SMTP settings' }
}

// ─────────────────────────────────────────────
// Send reminders to ALL bookings for a slab
// ─────────────────────────────────────────────
export async function sendAllPaymentReminders(
  slabId: number
): Promise<{ sent: number; failed: number; skipped: number }> {
  await requireRole(['ACCOUNTS', 'ADMIN'])
  const bookings = await getSlabBookings(slabId)
  let sent = 0, failed = 0, skipped = 0

  for (const b of bookings) {
    if (!b.applicant_email) { skipped++; continue }
    const res = await sendPaymentReminder(b.id, slabId)
    res.success ? sent++ : failed++
  }

  return { sent, failed, skipped }
}
