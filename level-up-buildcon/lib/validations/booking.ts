import { z } from 'zod'

const optionalString = z.string().optional().or(z.literal(''))
const optionalNumber = z.union([z.number(), z.string()]).optional().transform(val => {
  if (val === undefined || val === '' || val === null) return undefined
  const num = Number(val)
  return isNaN(num) ? undefined : num
})

export const step1Schema = z.object({
  project_name: optionalString,
  project_location: optionalString,
  project_address: optionalString,
  rera_regn_no: optionalString,
  building_permit_no: optionalString,
  unit_category: z.enum(['Residential', 'Commercial']).optional(),
  unit_type: z.enum(['Residential', 'Commercial']).optional(),
  unit_type_other_text: optionalString,
  unit_no: optionalString,
  floor_no: optionalString,
  builtup_area: optionalNumber,
  super_builtup_area: optionalNumber,
  carpet_area: optionalNumber,
}) as any

export const step2Schema = z.object({
  applicant_name: optionalString,
  applicant_father_or_spouse: optionalString,
  applicant_mobile: optionalString,
  applicant_email: optionalString,
  applicant_pan: optionalString,
  applicant_aadhaar: optionalString,
  applicant_address: optionalString,
  has_coapplicant: z.boolean().optional().default(false),
  coapplicant_name: optionalString,
  coapplicant_relationship: optionalString,
  coapplicant_mobile: optionalString,
  coapplicant_pan: optionalString,
  coapplicant_aadhaar: optionalString,
}) as any

export const step3Schema = z.object({
  rate_per_sqft: optionalNumber,
  total_cost: optionalNumber,
  booking_amount_paid: optionalNumber,
  gst_amount: optionalNumber,
  payment_mode: z.enum(['Cash', 'Cheque', 'NEFT_RTGS', 'UPI']).optional(),
  payment_mode_detail: optionalString,
  txn_or_cheque_no: optionalString,
  txn_date: optionalString,
  // kept for backward compat with existing bookings — not shown in form
  payment_plan_type: z.enum(['ConstructionLinked', 'DownPayment', 'PossessionLinked', 'Custom']).optional(),
  payment_plan_custom_text: optionalString,
  additional_parking: z.coerce.number().min(0).max(5).optional().default(0),
  premium_parking: z.coerce.number().min(0).max(3).optional().default(0),
}) as any

export const bookingSchema = z.object({
  ...step1Schema.shape,
  ...step2Schema.shape,
  ...step3Schema.shape,
})

export type Step1Data = z.infer<typeof step1Schema>
export type Step2Data = z.infer<typeof step2Schema>
export type Step3Data = z.infer<typeof step3Schema>
export type BookingFormData = z.infer<typeof bookingSchema>

