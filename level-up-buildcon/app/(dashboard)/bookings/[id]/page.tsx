import Link from 'next/link'
import { redirect } from 'next/navigation'
import { format } from 'date-fns'
import { Download, Edit, ExternalLink, FileText } from 'lucide-react'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BookingStatusBadge, InstallmentStatusBadge, PaymentStandingBadge, paymentStanding } from '@/components/booking/status-badge'
import { RecordPaymentDialog } from '@/components/payments/record-payment-dialog'
import { ApplyReceivedMoney, ClearanceButtons, ReverseAllocationButton } from '@/components/payments/apply-received-money'
import { expectedFor, payableFor, payersFor } from '@/lib/ledger/payers'
import type { Booking, BookingAuditLog, BookingDocument, Profile } from '@/lib/types/database'
import { considerationOf, financeContributions, type FinanceScenario } from '@/lib/booking/consideration'
import { formatInr, percentOfPaise, toHundredths } from '@/lib/booking/money'
import { loadBookingExtras } from '@/lib/booking/persist-details'
import { formatPersonName } from '@/lib/booking/person'
import { formatPaymentMode } from '@/lib/booking/payment-mode'
import { getUndividedLandShare } from '@/lib/data/land-share'
import { getOwnerTypeForFlat, OWNER_NAMES } from '@/lib/data/flat-ownership'
import { formatLetterDate } from '@/lib/documents/inr-words'
import { buildLetter } from '@/lib/documents/letter-model'
import { loadBookingLedger, type BookingLedger } from '@/lib/ledger/load'
import { CLEARANCE_LABELS, PAYMENT_MODE_LABELS } from '@/lib/ledger/model'
import { DownloadPDFsButton } from './download-pdfs-button'
import { ApproveRejectButtons } from './approve-reject-buttons'
import { FinalizeAgreementButton } from './finalize-agreement-button'
import { MoreActionsMenu } from './more-actions-menu'

interface BookingWithCreator extends Booking {
  creator: Profile
  [key: string]: unknown
}

interface AuditWithUser extends BookingAuditLog {
  user: Profile
}

const FINANCE_LABELS: Record<string, { title: string; detail: string }> = {
  purchaser: { title: 'Option 1: Purchaser-funded', detail: 'The purchaser(s) pay every installment.' },
  split_50_50: {
    title: 'Option 2: Booking installment shared with a bank',
    detail: 'Purchaser pays 10% of Total Consideration and the bank funds the rest of the booking installment. Later installments are not split automatically.',
  },
  split_10_90: { title: 'Option 3: 10% purchaser, 90% bank', detail: 'The purchaser pays 10% and the bank pays 90% of every installment.' },
}

const AUDIT_LABELS: Record<string, string> = {
  CREATED: 'Booking created',
  EDITED: 'Booking edited',
  APPROVED: 'Booking approved',
  REJECTED: 'Booking rejected',
  DELETED: 'Booking deleted',
  RESTORED: 'Booking restored',
  REVERTED_TO_DRAFT: 'Sent back to draft',
  DEMAND_ISSUED: 'Demand note issued',
  RECEIPT_ALLOCATED: 'Payment applied to installments',
  PAYMENT_RECORDED: 'Payment recorded',
  CHEQUE_CLEARED: 'Cheque cleared',
  CHEQUE_RETURNED: 'Payment returned',
  ALLOCATION_REVERSED: 'Allocation corrected',
  DEMAND_WITHDRAWN: 'Demand note withdrawn',
  MILESTONE_REOPENED: 'Milestone marked not completed',
}

async function getBooking(id: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('bookings')
    .select('*, creator:profiles!created_by(*)')
    .eq('id', id)
    .single()
  if (error || !data) return null
  const extras = await loadBookingExtras(supabase, id)
  return { ...data, ...extras } as BookingWithCreator
}

function Field({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <dt className="text-sm text-zinc-500">{label}</dt>
      <dd className="whitespace-pre-line text-right text-sm font-medium text-zinc-900">{value === 0 ? '0' : value || '—'}</dd>
    </div>
  )
}

function Panel({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <Card className="border-zinc-200 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function SummaryCard({ label, value, hint, tone }: { label: string; value: string; hint?: React.ReactNode; tone?: 'warn' }) {
  return (
    <div className={`rounded-xl border bg-white px-4 py-3 shadow-sm ${tone === 'warn' ? 'border-red-200' : 'border-zinc-200'}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-900">{value}</p>
      {hint && <div className="mt-0.5 text-xs text-zinc-500">{hint}</div>}
    </div>
  )
}

function DocumentRow({ title, status, tone, detail, children }: { title: string; status: string; tone: 'ok' | 'warn' | 'muted' | 'final'; detail?: string; children?: React.ReactNode }) {
  const tones = {
    ok: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    final: 'border-zinc-900 bg-zinc-900 text-white',
    warn: 'border-amber-200 bg-amber-50 text-amber-800',
    muted: 'border-zinc-200 bg-zinc-50 text-zinc-500',
  }
  return (
    <div className="flex flex-col gap-3 border-b border-zinc-100 py-4 last:border-0 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-zinc-900">{title}</p>
          <Badge variant="outline" className={tones[tone]}>{status}</Badge>
        </div>
        {detail && <p className="mt-1 text-sm text-zinc-500">{detail}</p>}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )
}

export default async function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await requireStaffPage()
  const supabase = await createClient()

  const [booking, auditResult, documentResult, agreementResult, demandResult] = await Promise.all([
    getBooking(id),
    supabase.from('booking_audit_log').select('*, user:profiles!changed_by(*)').eq('booking_id', id).order('changed_at', { ascending: false }),
    supabase.from('booking_documents').select('*').eq('booking_id', id).order('created_at'),
    supabase
      .from('booking_generated_documents')
      .select('version, created_at, finalized')
      .eq('booking_id', id)
      .eq('kind', 'agreement')
      .eq('finalized', true)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from('demand_notes').select('id, reference_number, issue_date, payment_deadline, trigger_label, schedule_row_id, created_at').eq('booking_id', id).order('issue_date'),
  ])
  if (!booking) redirect('/bookings')

  const auditLog = (auditResult.data || []) as AuditWithUser[]
  const documents = (documentResult.data || []) as BookingDocument[]
  const agreementFile = agreementResult.data
  const demandNotes = demandResult.error ? [] : demandResult.data || []

  let ledger: BookingLedger | null = null
  let ledgerError: string | null = null
  try {
    ledger = await loadBookingLedger(supabase, id)
  } catch (error) {
    ledgerError = error instanceof Error ? error.message : 'Payment records are not available.'
  }

  const canEdit = canEditBooking(profile, booking)
  const canEditViaWizard = canEditOwnDraft(profile, booking)
  const showApproveReject = canApproveOrRejectBooking(profile) && booking.status === 'PENDING'
  const isAdmin = canDeleteOrRestoreBooking(profile)
  const active = booking.status === 'SUBMITTED' || booking.status === 'EDITED'

  const priced = considerationOf(booking)
  const considerationGst = priced ? percentOfPaise(priced.totalPaise, 5) ?? 0n : 0n
  const owner = getOwnerTypeForFlat(booking.unit_no)
  const coapplicants = (booking.coapplicants || []) as Array<Record<string, string | null> & { id: string }>
  const primaryName = formatPersonName(booking.applicant_salutation, booking.applicant_name) || 'Primary applicant'
  const scheduleRows = booking.schedule_rows || []
  const storedSchedulePaise = scheduleRows.reduce((sum, row) => sum + (toHundredths(row.calculated_amount) ?? 0n), 0n)
  const scheduleNeedsReview = Boolean(priced && scheduleRows.length && storedSchedulePaise !== priced.totalPaise)
  const financeScenario = String(booking.finance_scenario || 'purchaser')
  const financed = financeScenario !== 'purchaser'

  const summary = ledger?.summary
  const standing = summary ? paymentStanding(summary) : null
  const installments = ledger?.state.installments || []

  const ledgerReady = Boolean(ledger?.migrationApplied)
  const recordPayment = ledger && active && (
    <RecordPaymentDialog
      bookingId={booking.id}
      installments={payableFor(ledger)}
      payers={payersFor(booking, coapplicants)}
      expected={expectedFor(ledger)}
      ledgerReady={ledgerReady}
    />
  )

  const allotment = buildLetter(booking, 'allotment')
  const noc = booking.noc_required ? buildLetter(booking, 'noc') : null
  const agreementStatus = owner === 'LANDOWNER'
    ? { label: 'Template not supplied', tone: 'muted' as const }
    : agreementFile
      ? { label: `Finalized · v${agreementFile.version}`, tone: 'final' as const }
      : { label: 'Draft', tone: 'warn' as const }
  const receiptsById = new Map((ledger?.receipts || []).map((receipt) => [receipt.id, receipt]))

  type HistoryEvent = { at: string; title: string; who?: string | null; detail?: string | null }
  const history: HistoryEvent[] = [
    ...auditLog.map((log) => ({
      at: log.changed_at,
      title: AUDIT_LABELS[log.action] || log.action.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()),
      who: log.user?.full_name,
      detail: log.reason,
    })),
    ...(agreementFile ? [{ at: agreementFile.created_at, title: `Agreement for Sale finalized (version ${agreementFile.version})` }] : []),
    ...(ledger?.receipts || [])
      .filter((receipt) => receipt.createdAt && !auditLog.some((log) => log.action === 'PAYMENT_RECORDED' && Math.abs(new Date(log.changed_at).getTime() - new Date(receipt.createdAt!).getTime()) < 60_000))
      .map((receipt) => ({
        at: receipt.createdAt!,
        title: receipt.source === 'booking_advance' ? 'Booking amount receipt recorded' : 'Payment receipt recorded',
        detail: `${formatInr(receipt.principalPaise)}${receipt.gstPaise > 0n ? ` + GST ${formatInr(receipt.gstPaise)}` : ''} · ${CLEARANCE_LABELS[receipt.clearance]}`,
      })),
    ...demandNotes
      .filter((note) => !auditLog.some((log) => log.action === 'DEMAND_ISSUED' && String(log.reason || '').includes(note.reference_number)))
      .map((note) => ({ at: note.created_at || note.issue_date, title: 'Demand note issued', detail: `${note.reference_number} · ${note.trigger_label}` })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1))

  return (
    <DashboardLayout profile={profile}>
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <Link href="/bookings" className="text-sm text-zinc-500 hover:text-zinc-900">← All Bookings</Link>
            <h1 className="text-3xl font-semibold text-zinc-900">
              {booking.unit_type === 'Flat' || !booking.unit_type ? 'Flat' : booking.unit_type} {booking.unit_no || '—'} — {booking.project_name || 'Anandam'}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-600">
              <Badge variant="outline" className="font-mono">{booking.serial_display || 'No serial yet'}</Badge>
              <span className="font-medium text-zinc-900">{primaryName}</span>
              {coapplicants.length > 0 && <span>+ {coapplicants.length} co-applicant{coapplicants.length === 1 ? '' : 's'}</span>}
              <BookingStatusBadge status={booking.status} />
              <Badge variant="outline" className={agreementStatus.tone === 'final' ? 'border-zinc-900 text-zinc-900' : 'border-zinc-200 text-zinc-600'}>
                Agreement: {agreementStatus.label}
              </Badge>
              {owner && <span className="text-zinc-500">{OWNER_NAMES[owner]} share</span>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {showApproveReject && <ApproveRejectButtons bookingId={booking.id} />}
            {recordPayment}
            {canEditViaWizard && (
              <Link href={`/new-booking?draftId=${booking.id}`}>
                <Button variant="outline" className="gap-2"><Edit className="h-4 w-4" />Edit Draft</Button>
              </Link>
            )}
            {canEdit && !canEditViaWizard && (
              <Link href={`/bookings/${booking.id}/edit`}>
                <Button variant="outline" className="gap-2"><Edit className="h-4 w-4" />Edit</Button>
              </Link>
            )}
            <DownloadPDFsButton bookingId={booking.id} serialDisplay={booking.serial_display || 'Booking'} />
            <MoreActionsMenu bookingId={booking.id} bookingStatus={booking.status} canRevert={isAdmin} canDelete={isAdmin} />
          </div>
        </div>

        {/* Financial summary */}
        {summary && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <SummaryCard label="Total Consideration" value={formatInr(summary.considerationPaise)} hint={`+ GST ${formatInr(summary.gstPayablePaise)} · excl. GST`} />
            <SummaryCard
              label="Total Received"
              value={formatInr(summary.receivedTotalPaise)}
              hint={`${formatInr(summary.receivedPrincipalPaise)} + GST ${formatInr(summary.receivedGstPaise)}`}
            />
            <SummaryCard
              label="Total Outstanding"
              value={formatInr(summary.outstandingPaise)}
              hint={summary.overduePaise > 0n ? <span className="text-red-600">{formatInr(summary.overduePaise)} overdue</span> : 'incl. GST'}
              tone={summary.overduePaise > 0n ? 'warn' : undefined}
            />
            <SummaryCard
              label="Next Payment Due"
              value={summary.nextDue ? formatInr(summary.nextDue.outstandingPaise) : 'Nothing due'}
              hint={summary.nextDue ? `${summary.nextDue.label}${summary.nextDue.due ? ' · due now' : ' · not due yet'}${summary.nextDue.deadline ? ` · pay by ${formatLetterDate(summary.nextDue.deadline)}` : ''}` : undefined}
            />
            <div className="col-span-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm lg:col-span-1">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Payment Progress</p>
                {standing && <PaymentStandingBadge standing={standing} />}
              </div>
              <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-900">{summary.progressPercent.toFixed(1)}%</p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-100" role="progressbar" aria-valuenow={summary.progressPercent} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full bg-zinc-900" style={{ width: `${summary.progressPercent}%` }} />
              </div>
              <p className="mt-1 text-xs text-zinc-500">of {formatInr(summary.payablePaise)} incl. GST</p>
            </div>
          </div>
        )}
        {ledgerError && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{ledgerError}</p>
        )}
        {scheduleNeedsReview && priced && (
          <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            Schedule needs authorized review: Total Consideration is {formatInr(priced.totalPaise)}, but the stored payment schedule totals {formatInr(storedSchedulePaise)}. A finalized agreement, issued demand note or recorded receipt is not overwritten automatically.
          </p>
        )}

        <Tabs defaultValue="overview" className="gap-4">
          <TabsList variant="line" className="w-full justify-start overflow-x-auto border-b border-zinc-200 pb-1">
            <TabsTrigger value="overview" className="flex-none px-3">Overview</TabsTrigger>
            <TabsTrigger value="financials" className="flex-none px-3">Financials</TabsTrigger>
            <TabsTrigger value="installments" className="flex-none px-3">Installments</TabsTrigger>
            <TabsTrigger value="documents" className="flex-none px-3">Documents</TabsTrigger>
            <TabsTrigger value="history" className="flex-none px-3">History</TabsTrigger>
          </TabsList>

          {/* Overview */}
          <TabsContent value="overview" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel title="Property & unit">
              <dl>
                <Field label="Project" value={`${booking.project_name || '—'}, ${booking.project_location || ''}`} />
                <Field label="Unit" value={`${booking.unit_type || 'Flat'} ${booking.unit_no || ''}${booking.floor_no ? ` · Floor ${booking.floor_no}` : ''}`} />
                <Field label="Category" value={booking.unit_category} />
                <Field label="Ownership share" value={owner ? OWNER_NAMES[owner] : undefined} />
                <Field label="Super built-up area" value={booking.super_builtup_area ? `${booking.super_builtup_area} sq.ft.` : undefined} />
                <Field label="Built-up area" value={booking.builtup_area != null ? `${booking.builtup_area} sq.ft.` : undefined} />
                <Field label="Carpet area" value={booking.carpet_area ? `${booking.carpet_area} sq.ft.` : undefined} />
                <Field label="Undivided land share" value={getUndividedLandShare(booking.project_name, booking.unit_no) != null ? `${getUndividedLandShare(booking.project_name, booking.unit_no)} sq.ft.` : undefined} />
                <Field label="Boundaries" value={[`North: ${booking.boundary_north || '—'}`, `South: ${booking.boundary_south || '—'}`, `East: ${booking.boundary_east || '—'}`, `West: ${booking.boundary_west || '—'}`].join('\n')} />
                <Field label="RERA registration" value={booking.rera_regn_no} />
              </dl>
            </Panel>
            <div className="space-y-4">
              <Panel title="Booking dates & status">
                <dl>
                  <Field label="Allotment date" value={formatLetterDate(booking.allotment_date) || undefined} />
                  <Field label="Agreement for Sale date" value={formatLetterDate(booking.agreement_for_sale_date) || undefined} />
                  <Field label="Submitted" value={booking.submitted_at ? format(new Date(booking.submitted_at), 'd MMM yyyy') : undefined} />
                  <Field label="Created by" value={booking.creator?.full_name} />
                  <Field label="Payment plan" value={booking.payment_plan_type === 'Custom' ? 'Custom schedule' : 'Standard construction-linked'} />
                  <Field label="Bank NOC" value={booking.noc_required ? `Requested · ${booking.noc_bank_name || 'bank not entered'}` : 'Not requested'} />
                </dl>
              </Panel>
              <Panel title="Parking">
                {(booking.parking_spaces || []).length === 0 ? (
                  <p className="text-sm text-zinc-500">No parking recorded.</p>
                ) : (
                  <dl>
                    {(booking.parking_spaces || []).map((space) => (
                      <Field
                        key={space.id}
                        label={`${space.kind === 'secondary' ? 'Secondary' : 'Main'} parking${Number(space.quantity) > 1 ? ` × ${space.quantity}` : ''}${space.label ? ` · ${space.label}` : ''}`}
                        value={formatInr(space.price || 0)}
                      />
                    ))}
                  </dl>
                )}
              </Panel>
              <Panel title="Financing">
                <p className="text-sm font-medium text-zinc-900">{FINANCE_LABELS[financeScenario]?.title}</p>
                <p className="mt-1 text-sm text-zinc-500">{FINANCE_LABELS[financeScenario]?.detail}</p>
                {financed && (
                  <dl className="mt-2">
                    <Field label="Bank" value={[booking.finance_bank_name, booking.finance_bank_branch].filter(Boolean).join(', ') as string} />
                    <Field label="Loan status" value={booking.finance_loan_status as string} />
                  </dl>
                )}
              </Panel>
            </div>
            <Panel title="Primary purchaser">
              <dl>
                <Field label="Name" value={primaryName} />
                <Field label="Parents' / Spouse's name" value={booking.applicant_father_or_spouse} />
                <Field label="Occupation" value={booking.applicant_occupation as string} />
                <Field label="Mobile" value={booking.applicant_mobile} />
                <Field label="Email" value={booking.applicant_email} />
                <Field label="PAN" value={booking.applicant_pan} />
                <Field label="Aadhaar" value={booking.applicant_aadhaar} />
                <Field label="Address" value={booking.applicant_address} />
              </dl>
            </Panel>
            <Panel title={coapplicants.length ? `Co-applicants (${coapplicants.length})` : 'Co-applicants'}>
              {coapplicants.length === 0 ? (
                booking.coapplicant_name ? (
                  <dl>
                    <Field label="Name" value={booking.coapplicant_name} />
                    <Field label="Relationship" value={booking.coapplicant_relationship} />
                    <Field label="Mobile" value={booking.coapplicant_mobile} />
                  </dl>
                ) : (
                  <p className="text-sm text-zinc-500">No co-applicants.</p>
                )
              ) : (
                <div className="divide-y divide-zinc-100">
                  {coapplicants.map((person) => (
                    <dl key={person.id} className="py-2 first:pt-0 last:pb-0">
                      <Field label="Name" value={formatPersonName(person.salutation, person.name)} />
                      <Field label="Parents' / Spouse's name" value={person.father_or_spouse} />
                      <Field label="Mobile" value={person.mobile} />
                      <Field label="PAN" value={person.pan} />
                      <Field label="Aadhaar" value={person.aadhaar} />
                      <Field label="Address" value={person.address} />
                    </dl>
                  ))}
                </div>
              )}
            </Panel>
          </TabsContent>

          {/* Financials */}
          <TabsContent value="financials" className="space-y-4">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Panel title="Price">
                <dl>
                  <Field label={booking.rate_per_sqft ? `Flat (${booking.super_builtup_area} sq.ft. × ${formatInr(booking.rate_per_sqft)})` : 'Flat (lump sum)'} value={priced ? formatInr(priced.flatPaise) : undefined} />
                  <Field label="Parking" value={priced ? formatInr(priced.parkingPaise) : undefined} />
                  <div className="my-1 border-t border-zinc-100" />
                  <Field label="Total Consideration (excl. GST)" value={priced ? formatInr(priced.totalPaise) : undefined} />
                  <Field label="GST @ 5%" value={formatInr(considerationGst)} />
                  <Field label="Total payable incl. GST" value={priced ? formatInr(priced.totalPaise + considerationGst) : undefined} />
                </dl>
              </Panel>
              <Panel title="Where the money stands">
                {summary ? (
                  <dl>
                    <Field label="Received and cleared" value={`${formatInr(summary.receivedTotalPaise)}  (${formatInr(summary.receivedPrincipalPaise)} + GST ${formatInr(summary.receivedGstPaise)})`} />
                    <Field label="Received, awaiting clearance" value={formatInr(summary.pendingClearancePaise)} />
                    <Field label="Expected from the bank (not received)" value={formatInr(summary.expectedBankPaise)} />
                    <Field label="Still unpaid" value={formatInr(summary.outstandingPaise)} />
                    {summary.overpaymentPaise > 0n && <Field label="Paid more than payable" value={formatInr(summary.overpaymentPaise)} />}
                    {summary.returnedPaise > 0n && <Field label="Failed / returned (not counted)" value={formatInr(summary.returnedPaise)} />}
                  </dl>
                ) : (
                  <p className="text-sm text-zinc-500">Not available.</p>
                )}
              </Panel>
            </div>

            {summary && (summary.unallocatedPrincipalPaise > 0n || summary.unallocatedGstPaise > 0n) && active && (
              <ApplyReceivedMoney
                bookingId={booking.id}
                unappliedLabel={`${formatInr(summary.unallocatedPrincipalPaise)} + GST ${formatInr(summary.unallocatedGstPaise)} has been received but is not applied to an installment yet, so those installments still show as unpaid.`}
              />
            )}
            {summary?.warnings.filter((warning) => !warning.startsWith('Some received money')).map((warning) => (
              <p key={warning} className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">{warning}</p>
            ))}

            <Panel title="Financing arrangement">
              <p className="text-sm font-medium text-zinc-900">{FINANCE_LABELS[financeScenario]?.title}</p>
              <p className="text-sm text-zinc-500">{FINANCE_LABELS[financeScenario]?.detail}</p>
              {priced && installments.length > 0 && (
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                  {installments.slice(0, financeScenario === 'split_10_90' ? 2 : 1).map((row, index) => {
                    const split = financeContributions(row.principalPaise, priced.totalPaise, financeScenario as FinanceScenario, index === 0 ? 'booking' : 'later')
                    return (
                      <div key={row.id} className="rounded-lg border border-zinc-200 px-4 py-3 text-sm">
                        <p className="text-xs text-zinc-500">{index === 0 ? 'Booking installment' : 'Each later installment, for example the next'} · {formatInr(row.principalPaise)}</p>
                        <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-zinc-100">
                          <div className="bg-zinc-900" style={{ width: `${row.principalPaise > 0n ? Number((split.purchaserPaise * 1000n) / row.principalPaise) / 10 : 0}%` }} />
                          <div className="bg-zinc-400" style={{ width: `${row.principalPaise > 0n ? Number((split.bankPaise * 1000n) / row.principalPaise) / 10 : 0}%` }} />
                        </div>
                        <div className="mt-1 flex justify-between text-xs text-zinc-600">
                          <span>Purchaser {formatInr(split.purchaserPaise)}</span>
                          <span>Bank {formatInr(split.bankPaise)}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
              {financed && (
                <dl className="mt-3 grid grid-cols-1 gap-x-8 md:grid-cols-2">
                  <Field label="Bank" value={booking.finance_bank_name as string} />
                  <Field label="Branch" value={booking.finance_bank_branch as string} />
                  <Field label="Loan status" value={booking.finance_loan_status as string} />
                  <Field label="Sanction number" value={booking.finance_sanction_ref as string} />
                  <Field label="Sanction date" value={formatLetterDate(booking.finance_sanction_date as string) || undefined} />
                  <Field label="Sanctioned amount" value={booking.finance_sanction_amount ? formatInr(booking.finance_sanction_amount) : undefined} />
                </dl>
              )}
              {(ledger?.expected || []).length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-sm font-medium text-zinc-900">Expected bank disbursements</p>
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
                      <tr><th className="py-1">Bank</th><th className="py-1">Expected by</th><th className="py-1 text-right">Expected</th><th className="py-1 text-right">Arrived</th><th className="py-1 text-right">Still expected</th></tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {(ledger?.expected || []).map((item) => (
                        <tr key={item.id}>
                          <td className="py-2">{item.bankName || item.payerName || 'Bank'}</td>
                          <td className="py-2">{item.date ? formatLetterDate(item.date) : '—'}</td>
                          <td className="py-2 text-right tabular-nums">{formatInr(item.amountPaise)}</td>
                          <td className="py-2 text-right tabular-nums">{formatInr(item.fulfilledPaise)}</td>
                          <td className="py-2 text-right tabular-nums">{formatInr(item.amountPaise > item.fulfilledPaise ? item.amountPaise - item.fulfilledPaise : 0n)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-2 text-xs text-zinc-500">Expected money is never counted as received. When the bank pays, record it with Record Payment and link it here.</p>
                </div>
              )}
            </Panel>

            <Panel title="Payments received" action={recordPayment}>
              {(ledger?.receipts || []).length === 0 ? (
                <p className="text-sm text-zinc-500">No payments recorded yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
                      <tr>
                        <th className="py-2 pr-3 font-medium">Date</th>
                        <th className="py-2 pr-3 font-medium">Payer</th>
                        <th className="py-2 pr-3 font-medium">Mode</th>
                        <th className="py-2 pr-3 text-right font-medium">Amount</th>
                        <th className="py-2 pr-3 font-medium">Status</th>
                        <th className="py-2 pr-3 text-right font-medium">Applied</th>
                        <th className="py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {(ledger?.receipts || []).map((receipt) => (
                        <tr key={receipt.id}>
                          <td className="py-2 pr-3 tabular-nums">{receipt.date ? formatLetterDate(receipt.date) : '—'}</td>
                          <td className="py-2 pr-3">
                            {receipt.payerName || (receipt.source === 'booking_advance' ? 'Booking amount' : receipt.payerKind || '—')}
                            {receipt.source === 'booking_advance' && <div className="text-xs text-zinc-500">From the booking form</div>}
                          </td>
                          <td className="py-2 pr-3">
                            {PAYMENT_MODE_LABELS[receipt.mode || ''] || receipt.mode || '—'}
                            {receipt.reference && <div className="text-xs text-zinc-500">{receipt.reference}</div>}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums">
                            {formatInr(receipt.principalPaise)}
                            <div className="text-xs text-zinc-500">+ GST {formatInr(receipt.gstPaise)}</div>
                          </td>
                          <td className="py-2 pr-3">
                            <Badge variant="outline" className={receipt.clearance === 'cleared' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : receipt.clearance === 'pending_clearance' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-red-200 bg-red-50 text-red-700'}>
                              {CLEARANCE_LABELS[receipt.clearance]}
                            </Badge>
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums">
                            {formatInr(receipt.allocatedPrincipalPaise + receipt.allocatedGstPaise)}
                            {receipt.clearance === 'cleared' && receipt.allocatedPrincipalPaise + receipt.allocatedGstPaise < receipt.principalPaise + receipt.gstPaise && (
                              <div className="text-xs text-amber-700">{formatInr(receipt.principalPaise + receipt.gstPaise - receipt.allocatedPrincipalPaise - receipt.allocatedGstPaise)} unapplied</div>
                            )}
                          </td>
                          <td className="py-2 text-right">
                            {receipt.clearance === 'pending_clearance' && <ClearanceButtons bookingId={booking.id} receiptId={receipt.id} />}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </TabsContent>

          {/* Installments */}
          <TabsContent value="installments">
            <Panel title="Installment schedule" action={recordPayment}>
              {!ledger?.state.finalized && <p className="mb-3 text-sm text-zinc-500">Installments become due after this booking is finalized.</p>}
              {ledger && ledger.state.blockers.length > 0 && ledger.state.finalized && (
                <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Demand notes are waiting: {ledger.state.blockers.join(' ')}</p>
              )}
              {installments.length === 0 ? (
                <p className="text-sm text-zinc-500">No payment schedule is saved on this booking.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
                      <tr>
                        <th className="py-2 pr-3 font-medium">Installment</th>
                        <th className="py-2 pr-3 text-right font-medium">Amount due</th>
                        <th className="py-2 pr-3 text-right font-medium">Received</th>
                        <th className="py-2 pr-3 text-right font-medium">Outstanding</th>
                        <th className="py-2 pr-3 font-medium">Status</th>
                        <th className="py-2 font-medium">Demand note</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 align-top">
                      {installments.map((row, index) => {
                        const applied = (ledger?.allocations || []).filter((item) => item.scheduleRowId === row.id)
                        return (
                          <tr key={row.id}>
                            <td className="py-2 pr-3">
                              <p className="font-medium text-zinc-900">{index + 1}. {row.label}</p>
                              <p className="text-xs text-zinc-500">{row.trigger === 'date' ? 'Scheduled date' : 'Construction milestone'}</p>
                              {applied.length > 0 && (
                                <details className="mt-1 text-xs text-zinc-600">
                                  <summary className="cursor-pointer text-zinc-500 hover:text-zinc-900">Payment history ({applied.length})</summary>
                                  <ul className="mt-1 space-y-1">
                                    {applied.map((item) => {
                                      const receipt = receiptsById.get(item.receiptId)
                                      return (
                                        <li key={item.id} className="flex items-center justify-between gap-2">
                                          <span>
                                            {receipt?.date ? formatLetterDate(receipt.date) : '—'} · {formatInr(item.principalPaise)} + GST {formatInr(item.gstPaise)}
                                            {receipt?.payerName ? ` · ${receipt.payerName}` : ''}
                                          </span>
                                          {isAdmin && ledgerReady && <ReverseAllocationButton bookingId={booking.id} allocationId={item.id} />}
                                        </li>
                                      )
                                    })}
                                  </ul>
                                </details>
                              )}
                            </td>
                            <td className="py-2 pr-3 text-right tabular-nums">
                              {formatInr(row.principalPaise + row.gstPaise)}
                              <div className="text-xs text-zinc-500">{formatInr(row.principalPaise)} + GST {formatInr(row.gstPaise)}</div>
                            </td>
                            <td className="py-2 pr-3 text-right tabular-nums">{formatInr(row.receivedPaise + row.gstReceivedPaise)}</td>
                            <td className="py-2 pr-3 text-right font-medium tabular-nums">{formatInr(row.outstandingPrincipalPaise + row.outstandingGstPaise)}</td>
                            <td className="py-2 pr-3"><InstallmentStatusBadge status={row.status} /></td>
                            <td className="py-2">
                              {row.demandId ? (
                                <div className="space-y-0.5">
                                  <Link className="font-medium text-zinc-900 underline-offset-2 hover:underline" href={`/demand-notes/${row.demandId}`}>{row.referenceNumber}</Link>
                                  <div className="text-xs text-zinc-500">
                                    <a className="hover:text-zinc-900" href={`/api/demand-notes/${row.demandId}/pdf`} target="_blank" rel="noreferrer">Print</a>
                                    {row.deadline && ` · pay by ${formatLetterDate(row.deadline)}`}
                                  </div>
                                </div>
                              ) : row.due ? (
                                <span className="text-xs text-zinc-500">Due, not issued yet</span>
                              ) : (
                                <span className="text-zinc-400">—</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </TabsContent>

          {/* Documents */}
          <TabsContent value="documents" className="space-y-4">
            <Panel title="Booking documents">
              <DocumentRow
                title="Allotment Letter"
                status={allotment.issues.length ? 'Details missing' : 'Ready'}
                tone={allotment.issues.length ? 'warn' : 'ok'}
                detail={allotment.issues[0] || 'Generated on demand from the current booking. Preview and download use the same PDF.'}
              >
                <Link href={`/bookings/${booking.id}/letters?kind=allotment`}><Button variant="outline" size="sm">Preview</Button></Link>
                {!allotment.issues.length && (
                  <a href={`/api/bookings/${booking.id}/letters?kind=allotment&download=1`}><Button variant="outline" size="sm" className="gap-1"><Download className="h-3.5 w-3.5" />Download</Button></a>
                )}
              </DocumentRow>
              <DocumentRow
                title="Bank NOC"
                status={!noc ? 'Not requested' : noc.issues.length ? 'Details missing' : 'Ready'}
                tone={!noc ? 'muted' : noc.issues.length ? 'warn' : 'ok'}
                detail={!noc ? 'No NOC was requested on this booking.' : noc.issues[0] || `For ${booking.noc_bank_name}.`}
              >
                {noc && (
                  <>
                    <Link href={`/bookings/${booking.id}/letters?kind=noc`}><Button variant="outline" size="sm">Preview</Button></Link>
                    {!noc.issues.length && (
                      <a href={`/api/bookings/${booking.id}/letters?kind=noc&download=1`}><Button variant="outline" size="sm" className="gap-1"><Download className="h-3.5 w-3.5" />Download</Button></a>
                    )}
                  </>
                )}
              </DocumentRow>
              <DocumentRow
                title="Agreement for Sale"
                status={agreementStatus.label}
                tone={agreementStatus.tone}
                detail={
                  owner === 'LANDOWNER'
                    ? 'This flat is in the landowner allocation. No approved landowner template has been supplied, so no agreement is generated.'
                    : agreementFile
                      ? `Version ${agreementFile.version} was finalized on ${format(new Date(agreementFile.created_at), 'd MMM yyyy')}. Downloads return that frozen file.`
                      : 'The draft is built from the current booking each time. Finalize freezes it.'
                }
              >
                {owner !== 'LANDOWNER' && (
                  <>
                    <Link href={`/bookings/${booking.id}/agreement`}><Button variant="outline" size="sm">{agreementFile ? 'Preview' : 'Preview draft'}</Button></Link>
                    <a href={`/api/bookings/${booking.id}/agreement?format=docx&download=1`}><Button variant="outline" size="sm">Word</Button></a>
                    <a href={`/api/bookings/${booking.id}/agreement?format=pdf&download=1`}><Button variant="outline" size="sm">PDF</Button></a>
                    {!agreementFile && active && <FinalizeAgreementButton bookingId={booking.id} />}
                  </>
                )}
              </DocumentRow>
            </Panel>

            <Panel title={`Demand notes (${demandNotes.length})`}>
              {demandNotes.length === 0 ? (
                <p className="text-sm text-zinc-500">No demand notes issued. A note is issued when an installment becomes due.</p>
              ) : (
                demandNotes.map((note) => (
                  <DocumentRow key={note.id} title={note.reference_number} status="Issued" tone="ok" detail={`${note.trigger_label} · issued ${formatLetterDate(note.issue_date)} · pay by ${formatLetterDate(note.payment_deadline)}`}>
                    <Link href={`/demand-notes/${note.id}`}><Button variant="outline" size="sm">Open</Button></Link>
                    <a href={`/api/demand-notes/${note.id}/pdf`} target="_blank" rel="noreferrer"><Button variant="outline" size="sm" className="gap-1"><ExternalLink className="h-3.5 w-3.5" />Print</Button></a>
                  </DocumentRow>
                ))
              )}
            </Panel>

            <Panel title={`Uploaded applicant documents (${documents.length})`}>
              {documents.length === 0 ? (
                <p className="text-sm text-zinc-500">No PAN or Aadhaar files uploaded.</p>
              ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {documents.map((doc) => {
                    const ownerPerson = (doc as BookingDocument & { coapplicant_id?: string | null }).coapplicant_id
                      ? coapplicants.find((person) => person.id === (doc as BookingDocument & { coapplicant_id?: string | null }).coapplicant_id)
                      : null
                    const who = ownerPerson ? formatPersonName(ownerPerson.salutation, ownerPerson.name) : doc.document_type.startsWith('applicant') ? primaryName : 'Co-applicant'
                    const kind = doc.document_type.endsWith('pan') ? 'PAN' : 'Aadhaar'
                    return (
                      <div key={doc.id} className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <FileText className="h-5 w-5 shrink-0 text-zinc-500" />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-zinc-900">{who} · {kind}</p>
                            <p className="truncate text-xs text-zinc-500">{doc.file_name}</p>
                          </div>
                        </div>
                        <a href={`/api/bookings/${booking.id}/documents/${doc.id}`} target="_blank" rel="noopener noreferrer" className="ml-2 shrink-0">
                          <Button variant="outline" size="sm">View</Button>
                        </a>
                      </div>
                    )
                  })}
                </div>
              )}
            </Panel>
          </TabsContent>

          {/* History */}
          <TabsContent value="history">
            <Panel title="History">
              {history.length === 0 ? (
                <p className="text-sm text-zinc-500">No recorded events.</p>
              ) : (
                <ol className="space-y-3">
                  {history.map((event, index) => (
                    <li key={`${event.at}-${index}`} className="flex gap-3 border-b border-zinc-100 pb-3 last:border-0 last:pb-0">
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-zinc-400" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-zinc-900">{event.title}</span>
                          {event.who && <Badge variant="outline" className="text-xs">{event.who}</Badge>}
                        </div>
                        <p className="text-xs text-zinc-500">{format(new Date(event.at), 'd MMM yyyy, h:mm a')}</p>
                        {event.detail && <p className="mt-1 text-sm text-zinc-700">{event.detail}</p>}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
              <p className="mt-4 text-xs text-zinc-500">Only events the system recorded are shown. Older bookings may have fewer entries.</p>
            </Panel>
          </TabsContent>
        </Tabs>

        {booking.payment_mode && (
          <p className="text-xs text-zinc-400">
            Booking form payment: {formatPaymentMode(booking.payment_mode, booking.payment_mode === 'Other' ? booking.payment_mode_detail : undefined)}
            {booking.txn_or_cheque_no ? ` · ${booking.txn_or_cheque_no}` : ''}
          </p>
        )}
      </div>
    </DashboardLayout>
  )
}

// Document generation and the background email after a save can take longer than the default limit.
export const maxDuration = 300
