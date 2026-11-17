'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ChevronLeft, CheckCircle2, Loader2, FileText, Image } from 'lucide-react'
import { BookingFormData } from '@/lib/validations/booking'
import { UploadedDoc } from './document-upload'
import { considerationOf, financeContributions, financeSplitFrom, type FinanceScenario } from '@/lib/booking/consideration'
import { formatInr, percentOfPaise } from '@/lib/booking/money'
import { formatPaymentMode } from '@/lib/booking/payment-mode'
import { formatPostalAddress } from '@/lib/booking/address'
import { formatPersonName } from '@/lib/booking/person'
import { getUndividedLandShare } from '@/lib/data/land-share'
import { resolveSchedule, standardScheduleRows } from '@/lib/booking/schedule'

const DOC_TYPE_LABELS: Record<string, string> = {
  applicant_pan: 'Applicant PAN',
  applicant_aadhaar: 'Applicant Aadhaar',
  coapplicant_pan: 'Co-Applicant PAN',
  coapplicant_aadhaar: 'Co-Applicant Aadhaar',
}

interface Step4ReviewProps {
  data: BookingFormData
  documents?: Record<string, UploadedDoc>
  onBack: () => void
  onSubmit: () => void
  submitting: boolean
  submitLabel?: string
}

export function Step4Review({ data: rawData, onBack, onSubmit, submitting, submitLabel = 'Submit Booking', documents = {} }: Step4ReviewProps) {
  const data = rawData as any
  const formatCurrency = (amount: number) => formatInr(amount)
  const priced = considerationOf(data)
  const schedule = priced == null
    ? null
    : resolveSchedule(
        priced.totalPaise,
        data.schedule_mode === 'custom' ? (data.schedule_rows || []) : standardScheduleRows()
      )
  const financeScenario = (data.finance_scenario || 'purchaser') as FinanceScenario
  const bookingInstallment = schedule?.rows[0]?.calculatedPaise
  const financeSplit = priced && bookingInstallment != null
    ? financeContributions(bookingInstallment, priced.totalPaise, financeScenario, 'booking', financeSplitFrom(data))
    : null
  const flatGst = priced ? percentOfPaise(priced.flatPaise, 5) ?? 0n : 0n
  const considerationGst = priced ? percentOfPaise(priced.totalPaise, 5) ?? 0n : 0n

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="space-y-3">
      <h4 className="font-semibold text-zinc-900">{title}</h4>
      <div className="bg-zinc-50 rounded-lg p-4 space-y-2 border border-zinc-200">
        {children}
      </div>
    </div>
  )

  const Field = ({ label, value }: { label: string; value?: string | number }) => (
    <div className="flex items-start justify-between py-1">
      <span className="text-sm text-zinc-600">{label}:</span>
      <span className="text-sm font-medium text-zinc-900 text-right ml-4 whitespace-pre-line">
        {value !== undefined && value !== null && value !== '' ? value : '-'}
      </span>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-blue-900">Review Your Booking</p>
            <p className="text-sm text-blue-700 mt-1">
              Please review all information carefully before submitting. Once submitted, a serial number will be generated and PDFs will be created.
            </p>
          </div>
        </div>
      </div>

      <Section title="Project & Unit Information">
        <Field label="Project Name" value={data.project_name as string} />
        <Field label="Location" value={data.project_location as string} />
        {(data.project_address as string) && <Field label="Address" value={data.project_address as string} />}
        {(data.rera_regn_no as string) && <Field label="RERA Registration" value={data.rera_regn_no as string} />}
        {(data.building_permit_no as string) && <Field label="Building Permit" value={data.building_permit_no as string} />}
        <Separator />
        <Field label="Unit Category" value={data.unit_category as string} />
        <Field label="Unit Type" value={(data.unit_type as string) === 'Other' ? (data.unit_type_other_text as string) : (data.unit_type as string)} />
        <Field label="Unit Number" value={data.unit_no as string} />
        <Field label="Allotment Date" value={data.allotment_date || 'Not entered'} />
        {(data.floor_no as string) && <Field label="Floor" value={data.floor_no as string} />}
        {data.builtup_area != null && <Field label="Built-up Area" value={`${data.builtup_area} sq.ft.`} />}
        {data.super_builtup_area && <Field label="Super Built-up Area" value={`${data.super_builtup_area} sq.ft.`} />}
        {getUndividedLandShare(data.project_name, data.unit_no) != null && (
          <Field label="Undivided land share" value={`${getUndividedLandShare(data.project_name, data.unit_no)} sq.ft.`} />
        )}
        <Separator />
        <Field label="East" value={data.boundary_east} />
        <Field label="West" value={data.boundary_west} />
        <Field label="North" value={data.boundary_north} />
        <Field label="South" value={data.boundary_south} />
      </Section>

      <Section title="Applicant Information">
        <Field label="Name" value={formatPersonName(data.applicant_salutation, data.applicant_name)} />
        <Field label="Parents' / Spouse's Name" value={data.applicant_father_or_spouse} />
        <Field label="Mobile" value={data.applicant_mobile} />
        {data.applicant_email && <Field label="Email" value={data.applicant_email} />}
        {data.applicant_pan && <Field label="PAN" value={data.applicant_pan} />}
        {data.applicant_aadhaar && <Field label="Aadhaar" value={data.applicant_aadhaar} />}
        <Field
          label="Address"
          value={formatPostalAddress({
            address_line1: data.applicant_address_line1,
            address_line2: data.applicant_address_line2,
            city: data.applicant_city,
            state: data.applicant_state,
            pin_code: data.applicant_pin_code,
            country: data.applicant_country || 'India',
          }) || data.applicant_address}
        />
        {(data.coapplicants || []).map((person: any, index: number) => (
          <div key={person.id || index}>
            <Separator />
            <div className="pt-2">
              <Badge variant="secondary" className="mb-2">Co-Applicant {index + 1}</Badge>
            </div>
            <Field label="Name" value={formatPersonName(person.salutation, person.name)} />
            <Field label="Parents' / Spouse's Name" value={person.father_or_spouse} />
            <Field label="Mobile" value={person.mobile} />
            <Field label="Email" value={person.email} />
            <Field label="PAN" value={person.pan} />
            <Field label="Aadhaar" value={person.aadhaar} />
            <Field label="Address" value={formatPostalAddress({ ...person, country: person.country || 'India' })} />
          </div>
        ))}
      </Section>

      <Section title="Pricing & Payment">
        {data.pricing_mode === 'lump_sum' ? (
          <Field label="Flat price" value="Lump sum" />
        ) : (
          <Field label="Rate per Sq.ft." value={formatCurrency(data.rate_per_sqft || 0)} />
        )}
        <Field label="Flat consideration" value={priced ? `${formatInr(priced.flatPaise)} · GST ${formatInr(flatGst)}` : formatCurrency(Number(data.total_cost) || 0)} />
        <Field label="Parking charges" value={formatCurrency(Number(data.total_parking_charges) || 0)} />
        <Field label="Total Consideration" value={priced ? `${formatInr(priced.totalPaise)} · GST ${formatInr(considerationGst)}` : formatCurrency(Number(data.total_property_value) || Number(data.total_cost) || 0)} />
        <Separator />
        {(data.parking_spaces || []).map((space: any) => (
          <Field
            key={space.id}
            label={`${space.kind === 'secondary' ? 'Secondary' : 'Main'} parking${Number(space.quantity) > 1 ? ` (${space.quantity})` : ''}`}
            value={formatCurrency(Number(space.price) || 0)}
          />
        ))}
        <Separator />
        <Field label="Booking Amount Paid" value={formatCurrency(Number(data.booking_amount_paid) || 0)} />
        <Field label="GST Applicable (5%)" value={formatCurrency(Number(data.gst_amount) || 0)} />
        <Field label="GST Collected" value={formatCurrency(Number(data.gst_collected) || 0)} />
        {data.payment_mode && <Field label="Payment Mode" value={formatPaymentMode(data.payment_mode, data.payment_mode === 'Other' ? data.payment_mode_detail : undefined)} />}
        {data.txn_or_cheque_no && <Field label="Transaction / Cheque No." value={data.txn_or_cheque_no} />}
        {data.txn_date && <Field label="Transaction Date" value={new Date(data.txn_date).toLocaleDateString()} />}
        {data.payment_mode !== 'Other' && data.payment_mode_detail && <Field label="Payment Details" value={data.payment_mode_detail} />}
        <Separator />
        {data.payment_plan_type && <Field label="Payment Plan" value={data.payment_plan_type.replace(/([A-Z])/g, ' $1').trim()} />}
        {data.payment_plan_custom_text && (
          <div className="pt-2">
            <p className="text-xs text-zinc-600 mb-1">Custom Plan Details:</p>
            <p className="text-sm text-zinc-700 bg-white p-2 rounded border border-zinc-300">
              {data.payment_plan_custom_text}
            </p>
          </div>
        )}
      </Section>

      <Section title="Bank NOC">
        <Field label="Required" value={data.noc_required ? 'Yes' : 'No'} />
        {data.noc_required && (
          <>
            <Field label="Agreement for Sale Date" value={data.agreement_for_sale_date || 'Not entered'} />
            <Field label="Bank Name" value={data.noc_bank_name} />
            <Field label="Addressee" value={data.noc_addressee} />
            <Field
              label="Bank Address"
              value={formatPostalAddress({
                address_line1: data.noc_bank_address_line1,
                address_line2: data.noc_bank_address_line2,
                city: data.noc_bank_city,
                state: data.noc_bank_state,
                pin_code: data.noc_bank_pin_code,
                country: data.noc_bank_country || 'India',
              }) || data.noc_bank_address}
            />
          </>
        )}
      </Section>

      <Section title="Payment Schedule">
        <Field label="Schedule" value={data.schedule_mode === 'custom' ? 'Custom' : 'Standard'} />
        {(schedule?.rows || []).map((row, index) => (
          <Field
            key={`${row.label}-${index}`}
            label={row.trigger_type === 'date' ? (row.milestone_date || row.label) : row.label}
            value={formatInr(row.calculated_amount)}
          />
        ))}
        {schedule && <Field label="Schedule total" value={formatInr(schedule.totalPaise)} />}
        {financeSplit && financeScenario !== 'purchaser' && (
          <>
            <Field label="Purchaser share of the booking installment" value={formatInr(financeSplit.purchaserPaise)} />
            <Field label="Bank share of the booking installment" value={formatInr(financeSplit.bankPaise)} />
          </>
        )}
        <p className="text-xs text-zinc-500">Percentages are of Total Consideration (flat + parking). GST is charged separately and is not in these amounts.</p>
      </Section>

      {/* Uploaded Documents */}
      {Object.keys(documents).length > 0 && (
        <Section title="Uploaded Documents">
          {Object.values(documents).map((doc) => (
            <div key={doc.id} className="flex items-center gap-2 py-1">
              {doc.mimeType?.startsWith('image/') ? (
                <Image className="w-4 h-4 text-zinc-500" />
              ) : (
                <FileText className="w-4 h-4 text-zinc-500" />
              )}
              <span className="text-sm text-zinc-600">{DOC_TYPE_LABELS[doc.documentType] || doc.documentType}:</span>
              <span className="text-sm font-medium text-zinc-900 ml-auto">{doc.fileName}</span>
            </div>
          ))}
        </Section>
      )}

      {/* Actions */}
      <div className="flex justify-between pt-4 border-t border-zinc-200">
        <Button 
          type="button" 
          variant="outline" 
          onClick={onBack} 
          disabled={submitting}
          className="gap-2"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </Button>
        <Button 
          onClick={onSubmit} 
          disabled={submitting}
          className="gap-2 bg-green-600 hover:bg-green-700"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4" />
              {submitLabel}
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

