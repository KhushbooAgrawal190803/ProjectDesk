import { z } from 'zod'

const optionalString = z.string().optional().or(z.literal(''))
const optionalNumber = z.union([z.number(), z.string()]).optional().transform((val) => {
  if (val === undefined || val === '' || val === null) return undefined
  const num = Number(val)
  return Number.isNaN(num) ? undefined : num
})

export const step1Schema = z.object({
  project_name: optionalString,
  project_location: optionalString,
  project_address: optionalString,
  rera_regn_no: optionalString,
  building_permit_no: optionalString,
  unit_category: z.enum(['Residential', 'Commercial']).optional(),
  unit_type: z.enum(['Flat', 'Villa', 'Plot', 'Shop', 'Office', 'Other']).optional(),
  unit_type_other_text: optionalString,
  unit_no: optionalString,
  floor_no: optionalString,
  boundary_east: optionalString,
  boundary_west: optionalString,
  boundary_north: optionalString,
  boundary_south: optionalString,
  builtup_area: optionalNumber,
  super_builtup_area: optionalNumber,
  carpet_area: optionalNumber,
  allotment_date: optionalString,
})

export const step2Schema = z.object({
  applicant_name: optionalString,
  applicant_salutation: optionalString,
  applicant_father_or_spouse: optionalString,
  applicant_relationship: optionalString,
  applicant_occupation: optionalString,
  applicant_mobile: optionalString,
  applicant_email: optionalString,
  applicant_pan: optionalString,
  applicant_aadhaar: optionalString,
  applicant_address: optionalString,
  applicant_address_line1: optionalString,
  applicant_address_line2: optionalString,
  applicant_city: optionalString,
  applicant_state: optionalString,
  applicant_pin_code: optionalString,
  applicant_country: optionalString,
  has_coapplicant: z.boolean().optional().default(false),
  coapplicant_name: optionalString,
  coapplicant_relationship: optionalString,
  coapplicant_mobile: optionalString,
  coapplicant_pan: optionalString,
  coapplicant_aadhaar: optionalString,
})

export const step3Schema = z.object({
  rate_per_sqft: optionalNumber,
  total_cost: optionalNumber,
  booking_amount_paid: optionalNumber,
  gst_amount: optionalNumber,
  gst_collected: optionalNumber,
  payment_mode: z.enum(['Cash', 'Cheque', 'NEFT_RTGS', 'UPI', 'Other']).optional(),
  payment_mode_detail: optionalString,
  txn_or_cheque_no: optionalString,
  txn_date: optionalString,
  payment_plan_type: z.enum(['ConstructionLinked', 'DownPayment', 'PossessionLinked', 'Custom']).optional(),
  payment_plan_custom_text: optionalString,
  additional_parking: z.number().min(0).max(79).optional(),
  premium_parking: z.number().min(0).max(27).optional(),
  noc_required: z.boolean().optional(),
  noc_bank_name: optionalString,
  noc_addressee: optionalString,
  noc_bank_address: optionalString,
  noc_bank_address_line1: optionalString,
  noc_bank_address_line2: optionalString,
  noc_bank_city: optionalString,
  noc_bank_state: optionalString,
  noc_bank_pin_code: optionalString,
  noc_bank_country: optionalString,
  agreement_for_sale_date: optionalString,
  finance_scenario: z.enum(['purchaser', 'split_50_50', 'split_10_90', '']).optional(),
  finance_bank_name: optionalString,
  finance_bank_branch: optionalString,
  finance_bank_address: optionalString,
  finance_loan_status: optionalString,
  finance_sanction_ref: optionalString,
  finance_sanction_amount: optionalNumber,
  finance_sanction_date: optionalString,
})

export const bookingSchema = z.object({
  ...step1Schema.shape,
  ...step2Schema.shape,
  ...step3Schema.shape,
})

/** Submit uses the same optional fields as a draft. */
export const submitBookingSchema = bookingSchema

export type Step1Data = z.output<typeof step1Schema>
export type Step1FormValues = z.input<typeof step1Schema>
export type Step2Data = z.output<typeof step2Schema>
export type Step2FormValues = z.input<typeof step2Schema>
export type Step3Data = z.output<typeof step3Schema>
export type Step3FormValues = z.input<typeof step3Schema>
export type BookingFormData = z.output<typeof bookingSchema>
export type BookingFormValues = z.input<typeof bookingSchema>

export function parseBookingDraft(data: unknown) {
  return bookingSchema.safeParse(data)
}

export function parseBookingSubmit(data: unknown) {
  return submitBookingSchema.safeParse(data)
}
