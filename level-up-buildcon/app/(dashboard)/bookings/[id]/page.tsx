import { redirect } from 'next/navigation'
import { requireStaffPage } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import {
  canApproveOrRejectBooking,
  canDeleteOrRestoreBooking,
  canEditBooking,
  canEditOwnDraft,
} from '@/lib/auth/permissions'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Building2, User, DollarSign, FileText, Edit, Download, History, Paperclip } from 'lucide-react'
import { Booking, Profile, BookingAuditLog, BookingDocument } from '@/lib/types/database'
import Link from 'next/link'
import { format } from 'date-fns'
import { DeleteBookingButton } from './delete-button'
import { DownloadPDFsButton } from './download-pdfs-button'
import { RevertToDraftButton } from './revert-to-draft-button'
import { ApproveRejectButtons } from './approve-reject-buttons'
import { considerationOf } from '@/lib/booking/consideration'
import { formatInr, toHundredths } from '@/lib/booking/money'
import { loadBookingExtras } from '@/lib/booking/persist-details'
import { formatPersonName } from '@/lib/booking/person'
import { formatLetterDate } from '@/lib/documents/inr-words'
import { formatPaymentMode } from '@/lib/booking/payment-mode'
import { getUndividedLandShare } from '@/lib/data/land-share'
import { InstallmentPanel } from './installment-panel'
import { FinalizeAgreementButton } from './finalize-agreement-button'

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

  const extras = await loadBookingExtras(supabase, id)
  return { ...data, ...extras, schedule_mode: data.payment_plan_type === 'Custom' ? 'custom' : 'standard' } as BookingWithCreator
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

async function getBookingDocuments(bookingId: string) {
  const supabase = await createClient()

  const { data } = await supabase
    .from('booking_documents')
    .select('*')
    .eq('booking_id', bookingId)
    .order('created_at')

  return (data || []) as BookingDocument[]
}

export default async function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await requireStaffPage()

  const supabase = await createClient()
  const [booking, auditLog, documents, agreementFile] = await Promise.all([
    getBooking(id),
    getAuditLog(id),
    getBookingDocuments(id),
    supabase
      .from('booking_generated_documents')
      .select('version, created_at')
      .eq('booking_id', id)
      .eq('kind', 'agreement')
      .eq('finalized', true)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then((result) => result.data),
  ])

  if (!booking) {
    redirect('/bookings')
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  }

  const canEdit = canEditBooking(profile, booking)
  const canEditViaWizard = canEditOwnDraft(profile, booking)
  const showApproveReject = canApproveOrRejectBooking(profile) && booking.status === 'PENDING'
  const showDelete = canDeleteOrRestoreBooking(profile)
  const showRevert = canDeleteOrRestoreBooking(profile) && booking.status !== 'DRAFT'
  const priced = considerationOf(booking)
  const scheduleRows = booking.schedule_rows || []
  const storedSchedulePaise = scheduleRows.reduce((sum, row) => sum + (toHundredths(row.calculated_amount) ?? 0n), 0n)
  const scheduleNeedsReview = Boolean(priced && scheduleRows.length && storedSchedulePaise !== priced.totalPaise)

  const Section = ({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) => (
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
      <span className="text-sm font-medium text-zinc-900 text-right ml-4 whitespace-pre-line">
        {value || '-'}
      </span>
    </div>
  )

  return (
    <DashboardLayout profile={profile}>
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-semibold text-zinc-900">Booking Details</h1>
              <Badge variant="outline" className="font-mono text-base">
                {booking.serial_display || '—'}
              </Badge>
              <Badge
                variant={booking.status === 'SUBMITTED' ? 'default' : booking.status === 'DRAFT' ? 'outline' : booking.status === 'PENDING' ? 'default' : 'secondary'}
                className={booking.status === 'SUBMITTED' ? 'bg-green-600' : booking.status === 'DRAFT' ? 'border-amber-400 text-amber-700' : booking.status === 'PENDING' ? 'bg-amber-500' : ''}
              >
                {booking.status}
              </Badge>
            </div>
            <p className="text-zinc-600">
              Created by {booking.creator?.full_name}{booking.submitted_at ? ` on ${format(new Date(booking.submitted_at), 'MMMM d, yyyy')}` : ''}
            </p>
          </div>
          <div className="flex gap-2">
            <DownloadPDFsButton bookingId={booking.id} serialDisplay={booking.serial_display || 'Booking'} />
            {showApproveReject && <ApproveRejectButtons bookingId={booking.id} />}
            {canEditViaWizard && (
              <Link href={`/new-booking?draftId=${booking.id}`}>
                <Button className="gap-2">
                  <Edit className="w-4 h-4" />
                  Edit Draft
                </Button>
              </Link>
            )}
            {canEdit && !canEditViaWizard && (
              <Link href={`/bookings/${booking.id}/edit`}>
                <Button className="gap-2">
                  <Edit className="w-4 h-4" />
                  Edit
                </Button>
              </Link>
            )}
            {showRevert && (
              <RevertToDraftButton bookingId={booking.id} canRevert bookingStatus={booking.status} />
            )}
            {showDelete && <DeleteBookingButton bookingId={booking.id} canDelete />}
          </div>
        </div>

        <Card className="border-zinc-200 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-zinc-600" />
              <CardTitle className="text-lg">Allotment letter and NOC</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-zinc-600">
              Preview uses the same PDF as the download. The letterhead is the Level Up Buildcon header, and the wording follows the developer or landowner share for this unit.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link href={`/bookings/${booking.id}/letters?kind=allotment`}>
                <Button variant="outline">Preview allotment letter</Button>
              </Link>
              <a href={`/api/bookings/${booking.id}/letters?kind=allotment&download=1`}>
                <Button variant="outline" className="gap-2"><Download className="w-4 h-4" />Download allotment letter</Button>
              </a>
              {booking.noc_required && (
                <>
                  <Link href={`/bookings/${booking.id}/letters?kind=noc`}>
                    <Button variant="outline">Preview NOC</Button>
                  </Link>
                  <a href={`/api/bookings/${booking.id}/letters?kind=noc&download=1`}>
                    <Button variant="outline" className="gap-2"><Download className="w-4 h-4" />Download NOC</Button>
                  </a>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Agreement for Sale</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-zinc-600">
              {agreementFile
                ? `Version ${agreementFile.version} is finalized. Later payments do not change this file.`
                : 'Preview uses the current booking. Finalize it when the wording is right. A landowner flat has no agreement until that template is supplied.'}
            </p>
            <div className="flex flex-wrap gap-2">
              <Link href={`/bookings/${booking.id}/agreement`}>
                <Button variant="outline">Preview</Button>
              </Link>
              <a href={`/api/bookings/${booking.id}/agreement?format=docx&download=1`}>
                <Button variant="outline">Download Word</Button>
              </a>
              <a href={`/api/bookings/${booking.id}/agreement?format=pdf&download=1`}>
                <Button variant="outline">Download PDF</Button>
              </a>
              {!agreementFile && <FinalizeAgreementButton bookingId={booking.id} />}
            </div>
          </CardContent>
        </Card>

        <Section icon={Building2} title="Project & Unit Information">
          <div className="space-y-1">
            <Field label="Project Name" value={booking.project_name} />
            <Field label="Location" value={booking.project_location} />
            {booking.project_address && <Field label="Address" value={booking.project_address} />}
            {booking.rera_regn_no && <Field label="RERA Registration" value={booking.rera_regn_no} />}
            {booking.building_permit_no && <Field label="Building Permit" value={booking.building_permit_no} />}
            <Separator className="my-3" />
            <Field label="Unit Category" value={booking.unit_category} />
            <Field label="Unit Type" value={booking.unit_type === 'Other' ? booking.unit_type_other_text : booking.unit_type} />
            <Field label="Unit Number" value={booking.unit_no} />
            {booking.floor_no && <Field label="Floor" value={booking.floor_no} />}
            <Field label="Allotment Date" value={formatLetterDate(booking.allotment_date) || undefined} />
            <Field label="Agreement for Sale Date" value={formatLetterDate(booking.agreement_for_sale_date) || undefined} />
            {booking.builtup_area != null && <Field label="Built-up Area" value={`${booking.builtup_area} sq.ft.`} />}
            {booking.super_builtup_area && <Field label="Super Built-up Area" value={`${booking.super_builtup_area} sq.ft.`} />}
            {booking.carpet_area && <Field label="Carpet Area" value={`${booking.carpet_area} sq.ft.`} />}
            {getUndividedLandShare(booking.project_name, booking.unit_no) != null && (
              <Field label="Undivided land share" value={`${getUndividedLandShare(booking.project_name, booking.unit_no)} sq.ft.`} />
            )}
            {booking.boundary_east && <Field label="East" value={booking.boundary_east} />}
            {booking.boundary_west && <Field label="West" value={booking.boundary_west} />}
            {booking.boundary_north && <Field label="North" value={booking.boundary_north} />}
            {booking.boundary_south && <Field label="South" value={booking.boundary_south} />}
          </div>
        </Section>

        <Section icon={User} title="Applicant Information">
          <div className="space-y-1">
            <Field label="Name" value={formatPersonName(booking.applicant_salutation, booking.applicant_name)} />
            <Field label="Parents' / Spouse's Name" value={booking.applicant_father_or_spouse} />
            <Field label="Mobile" value={booking.applicant_mobile} />
            {booking.applicant_email && <Field label="Email" value={booking.applicant_email} />}
            {booking.applicant_pan && <Field label="PAN" value={booking.applicant_pan} />}
            {booking.applicant_aadhaar && <Field label="Aadhaar" value={booking.applicant_aadhaar} />}
            {booking.applicant_address && <Field label="Address" value={booking.applicant_address} />}
            {(booking.coapplicants || []).map((person) => (
              <div key={person.id}>
                <Separator className="my-3" />
                <div className="pt-2 pb-1"><Badge variant="secondary">{person.name || 'Co-Applicant'}</Badge></div>
                <Field label="Name" value={formatPersonName(person.salutation, person.name)} />
                <Field label="Parents' / Spouse's Name" value={person.father_or_spouse || undefined} />
                {person.mobile && <Field label="Mobile" value={person.mobile} />}
                {person.email && <Field label="Email" value={person.email} />}
                {person.pan && <Field label="PAN" value={person.pan} />}
                {person.aadhaar && <Field label="Aadhaar" value={person.aadhaar} />}
                {person.address && <Field label="Address" value={person.address} />}
              </div>
            ))}
            {!booking.coapplicants?.length && booking.coapplicant_name && (
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

        {scheduleNeedsReview && priced && (
          <Card className="border-amber-300 bg-amber-50 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg text-amber-950">Schedule needs authorized review</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-amber-950 space-y-1">
              <p>
                Total Consideration is {formatInr(priced.totalPaise)} (flat {formatInr(priced.flatPaise)}
                {priced.parkingPaise > 0n ? ` + parking ${formatInr(priced.parkingPaise)}` : ''}).
                The stored payment schedule totals {formatInr(storedSchedulePaise)}.
              </p>
              <p>
                Installment percentages must be of Total Consideration, including parking. A finalized agreement, issued demand note or recorded receipt is not overwritten automatically.
              </p>
            </CardContent>
          </Card>
        )}

        <Section icon={DollarSign} title="Pricing & Payment">
          <div className="space-y-1">
            {booking.rate_per_sqft ? (
              <Field label="Rate per Sq.ft." value={formatCurrency(booking.rate_per_sqft)} />
            ) : booking.total_cost ? (
              <Field label="Flat price" value="Lump sum" />
            ) : null}
            <Field label="Flat consideration" value={formatCurrency(booking.basic_sale_price || booking.total_cost)} />
            <Field label="Parking charges" value={formatCurrency(booking.total_parking_charges || 0)} />
            {(booking.parking_spaces || []).map((space) => (
              <Field
                key={space.id}
                label={`${space.kind === 'secondary' ? 'Secondary' : 'Main'} parking${Number(space.quantity) > 1 ? ` (${space.quantity})` : ''}`}
                value={formatCurrency(Number(space.price) || 0)}
              />
            ))}
            <Field label="Total Consideration" value={formatCurrency(booking.total_property_value || booking.total_cost)} />
            <Separator className="my-3" />
            <Field label="Booking Amount Paid" value={formatCurrency(booking.booking_amount_paid)} />
            <Field label="GST Applicable (5%)" value={formatCurrency(booking.gst_amount || 0)} />
            <Field label="GST Collected" value={formatCurrency(booking.gst_collected || 0)} />
            {booking.noc_required && <Field label="Bank NOC" value={`${booking.noc_bank_name || ''} — ${booking.noc_addressee || ''}`} />}
            {booking.noc_required && booking.noc_bank_address && <Field label="Bank Address" value={booking.noc_bank_address} />}
            {booking.payment_mode && <Field label="Payment Mode" value={formatPaymentMode(booking.payment_mode, booking.payment_mode === 'Other' ? booking.payment_mode_detail : undefined)} />}
            {booking.txn_or_cheque_no && <Field label="Transaction / Cheque No." value={booking.txn_or_cheque_no} />}
            {booking.txn_date && <Field label="Transaction Date" value={format(new Date(booking.txn_date), 'MMMM d, yyyy')} />}
            {booking.payment_mode !== 'Other' && booking.payment_mode_detail && <Field label="Payment Details" value={booking.payment_mode_detail} />}
            <Separator className="my-3" />
            {booking.payment_plan_type && <Field label="Payment Plan" value={booking.payment_plan_type.replace(/([A-Z])/g, ' $1').trim()} />}
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

        <InstallmentPanel bookingId={booking.id} />

        {documents.length > 0 && (
          <Section icon={Paperclip} title="Uploaded Documents">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {documents.map((doc) => {
                const docLabels: Record<string, string> = {
                  applicant_pan: 'Applicant PAN',
                  applicant_aadhaar: 'Applicant Aadhaar',
                  coapplicant_pan: 'Co-Applicant PAN',
                  coapplicant_aadhaar: 'Co-Applicant Aadhaar',
                }
                return (
                  <div key={doc.id} className="flex items-center justify-between p-3 bg-zinc-50 rounded-lg border border-zinc-200">
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText className="w-5 h-5 text-zinc-500 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-zinc-900 truncate">{docLabels[doc.document_type] || doc.document_type}</p>
                        <p className="text-xs text-zinc-500 truncate">{doc.file_name}</p>
                      </div>
                    </div>
                    <a
                      href={`/api/bookings/${booking.id}/documents/${doc.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-shrink-0 ml-2"
                    >
                      <Button variant="outline" size="sm" className="gap-1">
                        <Download className="w-3 h-3" />
                        View
                      </Button>
                    </a>
                  </div>
                )
              })}
            </div>
          </Section>
        )}

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
