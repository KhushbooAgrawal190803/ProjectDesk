'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ChevronLeft, CheckCircle2, Loader2 } from 'lucide-react'
import { BookingFormData } from '@/lib/validations/booking'

interface Step4ReviewProps {
  data: BookingFormData
  onBack: () => void
  onSubmit: () => void
  submitting: boolean
}

export function Step4Review({ data: rawData, onBack, onSubmit, submitting }: Step4ReviewProps) {
  const data = rawData as any
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount)
  }

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
      <span className="text-sm font-medium text-zinc-900 text-right ml-4">
        {value || '-'}
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
        {(data.rera_regn_no as string) && <Field label="RERA Registration" value={data.rera_regn_no as string} />}
        <Separator />
        <Field label="Unit Category" value={data.unit_category as string} />
        <Field label="Unit Type" value={(data.unit_type as string) === 'Other' ? (data.unit_type_other_text as string) : (data.unit_type as string)} />
        <Field label="Unit Number" value={data.unit_no as string} />
        {(data.floor_no as string) && <Field label="Floor" value={data.floor_no as string} />}
        {data.super_builtup_area && <Field label="Super Built-up Area" value={`${data.super_builtup_area} sq.ft.`} />}
        {data.carpet_area && <Field label="Carpet Area" value={`${data.carpet_area} sq.ft.`} />}
      </Section>

      <Section title="Applicant Information">
        <Field label="Name" value={data.applicant_name} />
        <Field label="Father's / Spouse Name" value={data.applicant_father_or_spouse} />
        <Field label="Mobile" value={data.applicant_mobile} />
        {data.applicant_email && <Field label="Email" value={data.applicant_email} />}
        {data.applicant_pan && <Field label="PAN" value={data.applicant_pan} />}
        {data.applicant_aadhaar && <Field label="Aadhaar" value={data.applicant_aadhaar} />}
        {data.applicant_address && <Field label="Address" value={data.applicant_address} />}
        
        {data.coapplicant_name && (
          <>
            <Separator />
            <div className="pt-2">
              <Badge variant="secondary" className="mb-2">Co-Applicant</Badge>
            </div>
            <Field label="Name" value={data.coapplicant_name} />
            <Field label="Relationship" value={data.coapplicant_relationship} />
            {data.coapplicant_mobile && <Field label="Mobile" value={data.coapplicant_mobile} />}
            {data.coapplicant_pan && <Field label="PAN" value={data.coapplicant_pan} />}
            {data.coapplicant_aadhaar && <Field label="Aadhaar" value={data.coapplicant_aadhaar} />}
          </>
        )}
      </Section>

      <Section title="Pricing & Payment">
        <Field label="Basic Sale Price" value={formatCurrency(data.basic_sale_price)} />
        <Field label="Other Charges" value={formatCurrency(data.other_charges || 0)} />
        <Separator />
        <Field label="Total Cost" value={formatCurrency(data.total_cost)} />
        {data.total_cost_override_reason && (
          <div className="pt-2">
            <p className="text-xs text-amber-600 mb-1">Override Reason:</p>
            <p className="text-sm text-zinc-700 bg-amber-50 p-2 rounded border border-amber-200">
              {data.total_cost_override_reason}
            </p>
          </div>
        )}
        <Separator />
        <Field label="Booking Amount Paid" value={formatCurrency(data.booking_amount_paid)} />
        <Field label="Payment Mode" value={data.payment_mode.replace('_', ' / ')} />
        {data.txn_or_cheque_no && <Field label="Transaction / Cheque No." value={data.txn_or_cheque_no} />}
        {data.txn_date && <Field label="Transaction Date" value={new Date(data.txn_date).toLocaleDateString()} />}
        {data.payment_mode_detail && <Field label="Payment Details" value={data.payment_mode_detail} />}
        <Separator />
        <Field label="Payment Plan" value={data.payment_plan_type.replace(/([A-Z])/g, ' $1').trim()} />
        {data.payment_plan_custom_text && (
          <div className="pt-2">
            <p className="text-xs text-zinc-600 mb-1">Custom Plan Details:</p>
            <p className="text-sm text-zinc-700 bg-white p-2 rounded border border-zinc-300">
              {data.payment_plan_custom_text}
            </p>
          </div>
        )}
      </Section>

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
              Submit Booking
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

