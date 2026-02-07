import { redirect } from 'next/navigation'
import { requireProfile } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Building2, User, DollarSign, FileText, Edit, Download, History } from 'lucide-react'
import { Booking, Profile, BookingAuditLog } from '@/lib/types/database'
import Link from 'next/link'
import { format } from 'date-fns'
import { DeleteBookingButton } from './delete-button'
import { DownloadPDFsButton } from './download-pdfs-button'

interface BookingWithCreator extends Booking {
  creator: Profile
}

interface AuditWithUser extends BookingAuditLog {
  user: Profile
}

async function getBooking(id: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('bookings')
    .select(`
      *,
      creator:profiles!created_by(*)
    `)
    .eq('id', id)
    .single()

  if (error || !data) {
    return null
  }

  return data as BookingWithCreator
}

async function getAuditLog(bookingId: string) {
  const supabase = await createClient()

  const { data } = await supabase
    .from('booking_audit_log')
    .select(`
      *,
      user:profiles!changed_by(*)
    `)
    .eq('booking_id', bookingId)
    .order('changed_at', { ascending: false })

  return (data || []) as AuditWithUser[]
}

export default async function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await requireProfile()
  if (!profile) {
    redirect('/login')
  }

  const [booking, auditLog] = await Promise.all([
    getBooking(id),
    getAuditLog(id),
  ])

  if (!booking) {
    redirect('/bookings')
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount)
  }

  const canEdit = profile.role === 'ADMIN' || profile.role === 'EXECUTIVE'

  const Section = ({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) => (
    <Card className="border-zinc-200 shadow-sm">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Icon className="w-5 h-5 text-zinc-600" />
          <CardTitle className="text-lg">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )

  const Field = ({ label, value }: { label: string; value?: string | number }) => (
    <div className="flex items-start justify-between py-2">
      <span className="text-sm text-zinc-600">{label}:</span>
      <span className="text-sm font-medium text-zinc-900 text-right ml-4">
        {value || '-'}
      </span>
    </div>
  )

  return (
    <DashboardLayout profile={profile}>
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-semibold text-zinc-900">Booking Details</h1>
              <Badge variant="outline" className="font-mono text-base">
                {booking.serial_display}
              </Badge>
              <Badge 
                variant={booking.status === 'SUBMITTED' ? 'default' : 'secondary'}
                className={booking.status === 'SUBMITTED' ? 'bg-green-600' : ''}
              >
                {booking.status}
              </Badge>
            </div>
            <p className="text-zinc-600">
              Created by {booking.creator?.full_name} on {booking.submitted_at && format(new Date(booking.submitted_at), 'MMMM d, yyyy')}
            </p>
          </div>
          <div className="flex gap-2">
            <DownloadPDFsButton bookingId={booking.id} serialDisplay={booking.serial_display || 'Booking'} />
            {canEdit && (
              <Link href={`/bookings/${booking.id}/edit`}>
                <Button className="gap-2">
                  <Edit className="w-4 h-4" />
                  Edit
                </Button>
              </Link>
            )}
            <DeleteBookingButton bookingId={booking.id} canDelete={canEdit} />
          </div>
        </div>

        {/* Project & Unit */}
        <Section icon={Building2} title="Project & Unit Information">
          <div className="space-y-1">
            <Field label="Project Name" value={booking.project_name} />
            <Field label="Location" value={booking.project_location} />
            {booking.rera_regn_no && <Field label="RERA Registration" value={booking.rera_regn_no} />}
            <Separator className="my-3" />
            <Field label="Unit Category" value={booking.unit_category} />
            <Field label="Unit Type" value={booking.unit_type === 'Other' ? booking.unit_type_other_text : booking.unit_type} />
            <Field label="Unit Number" value={booking.unit_no} />
            {booking.floor_no && <Field label="Floor" value={booking.floor_no} />}
            {booking.super_builtup_area && <Field label="Super Built-up Area" value={`${booking.super_builtup_area} sq.ft.`} />}
            {booking.carpet_area && <Field label="Carpet Area" value={`${booking.carpet_area} sq.ft.`} />}
          </div>
        </Section>

        {/* Applicant */}
        <Section icon={User} title="Applicant Information">
          <div className="space-y-1">
            <Field label="Name" value={booking.applicant_name} />
            <Field label="Father's / Spouse Name" value={booking.applicant_father_or_spouse} />
            <Field label="Mobile" value={booking.applicant_mobile} />
            {booking.applicant_email && <Field label="Email" value={booking.applicant_email} />}
            {booking.applicant_pan && <Field label="PAN" value={booking.applicant_pan} />}
            {booking.applicant_aadhaar && <Field label="Aadhaar" value={booking.applicant_aadhaar} />}
            {booking.applicant_address && <Field label="Address" value={booking.applicant_address} />}
            
            {booking.coapplicant_name && (
              <>
                <Separator className="my-3" />
                <div className="pt-2 pb-1">
                  <Badge variant="secondary">Co-Applicant</Badge>
                </div>
                <Field label="Name" value={booking.coapplicant_name} />
                <Field label="Relationship" value={booking.coapplicant_relationship} />
                {booking.coapplicant_mobile && <Field label="Mobile" value={booking.coapplicant_mobile} />}
                {booking.coapplicant_pan && <Field label="PAN" value={booking.coapplicant_pan} />}
                {booking.coapplicant_aadhaar && <Field label="Aadhaar" value={booking.coapplicant_aadhaar} />}
              </>
            )}
          </div>
        </Section>

        {/* Pricing & Payment */}
        <Section icon={DollarSign} title="Pricing & Payment">
          <div className="space-y-1">
            <Field label="Basic Sale Price" value={formatCurrency(booking.basic_sale_price)} />
            <Field label="Other Charges" value={formatCurrency(booking.other_charges || 0)} />
            <Separator className="my-3" />
            <Field label="Total Cost" value={formatCurrency(booking.total_cost)} />
            {booking.total_cost_override_reason && (
              <div className="pt-2 pb-1">
                <p className="text-xs text-amber-600 mb-1">Override Reason:</p>
                <p className="text-sm text-zinc-700 bg-amber-50 p-3 rounded border border-amber-200">
                  {booking.total_cost_override_reason}
                </p>
              </div>
            )}
            <Separator className="my-3" />
            <Field label="Booking Amount Paid" value={formatCurrency(booking.booking_amount_paid)} />
            <Field label="Payment Mode" value={booking.payment_mode.replace('_', ' / ')} />
            {booking.txn_or_cheque_no && <Field label="Transaction / Cheque No." value={booking.txn_or_cheque_no} />}
            {booking.txn_date && <Field label="Transaction Date" value={format(new Date(booking.txn_date), 'MMMM d, yyyy')} />}
            {booking.payment_mode_detail && <Field label="Payment Details" value={booking.payment_mode_detail} />}
            <Separator className="my-3" />
            <Field label="Payment Plan" value={booking.payment_plan_type.replace(/([A-Z])/g, ' $1').trim()} />
            {booking.payment_plan_custom_text && (
              <div className="pt-2">
                <p className="text-xs text-zinc-600 mb-1">Custom Plan Details:</p>
                <p className="text-sm text-zinc-700 bg-zinc-50 p-3 rounded border border-zinc-200">
                  {booking.payment_plan_custom_text}
                </p>
              </div>
            )}
          </div>
        </Section>

        {/* Audit Log */}
        {auditLog.length > 0 && (
          <Section icon={History} title="History">
            <div className="space-y-3">
              {auditLog.map((log) => (
                <div key={log.id} className="flex items-start gap-4 pb-3 border-b border-zinc-200 last:border-0 last:pb-0">
                  <div className="w-2 h-2 rounded-full bg-zinc-400 mt-2" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-zinc-900">{log.action}</span>
                      <Badge variant="outline" className="text-xs">
                        {log.user?.full_name}
                      </Badge>
                    </div>
                    <p className="text-sm text-zinc-600">
                      {format(new Date(log.changed_at), 'MMMM d, yyyy h:mm a')}
                    </p>
                    {log.reason && (
                      <p className="text-sm text-zinc-700 mt-2 bg-zinc-50 p-2 rounded">
                        {log.reason}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}
      </div>
    </DashboardLayout>
  )
}

