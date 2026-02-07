import { z } from 'zod'

export const step1Schema = z.object({
  project_name: z.string().min(1, 'Project name is required'),
  project_location: z.string().min(1, 'Project location is required'),
  rera_regn_no: z.string().optional(),
  unit_category: z.enum(['Residential', 'Commercial']),
  unit_type: z.enum(['Flat', 'Villa', 'Plot', 'Shop', 'Office', 'Other']),
  unit_type_other_text: z.string().optional(),
  unit_no: z.string().min(1, 'Unit number is required'),
  floor_no: z.string().optional(),
  super_builtup_area: z.union([z.number(), z.string()]).optional().transform(val => val ? parseFloat(String(val)) : undefined),
  carpet_area: z.union([z.number(), z.string()]).optional().transform(val => val ? parseFloat(String(val)) : undefined),
}).refine(
  (data) => {
    if (data.unit_type === 'Other' && !data.unit_type_other_text) {
      return false
    }
    return true
  },
  {
    message: 'Please specify the unit type',
    path: ['unit_type_other_text'],
  }
) as any

export const step2Schema = z.object({
  applicant_name: z.string().min(1, 'Applicant name is required'),
  applicant_father_or_spouse: z.string().min(1, 'Father/Spouse name is required'),
  applicant_mobile: z.string().regex(/^[6-9]\d{9}$/, 'Invalid mobile number'),
  applicant_email: z.string().email('Invalid email').optional().or(z.literal('')),
  applicant_pan: z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, 'Invalid PAN').optional().or(z.literal('')),
  applicant_aadhaar: z.string().regex(/^\d{12}$/, 'Invalid Aadhaar').optional().or(z.literal('')),
  applicant_address: z.string().optional(),
  has_coapplicant: z.boolean().optional().default(false),
  coapplicant_name: z.string().optional(),
  coapplicant_relationship: z.string().optional(),
  coapplicant_mobile: z.string().optional(),
  coapplicant_pan: z.string().optional(),
  coapplicant_aadhaar: z.string().optional(),
}).refine(
  (data) => {
    if (data.has_coapplicant) {
      if (!data.coapplicant_name) return false
      if (!data.coapplicant_relationship) return false
      if (data.coapplicant_mobile && !/^[6-9]\d{9}$/.test(data.coapplicant_mobile)) return false
      if (data.coapplicant_pan && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(data.coapplicant_pan)) return false
      if (data.coapplicant_aadhaar && !/^\d{12}$/.test(data.coapplicant_aadhaar)) return false
    }
    return true
  },
  {
    message: 'Co-applicant details are incomplete',
    path: ['coapplicant_name'],
  }
)

export const step3Schema = z.object({
  basic_sale_price: z.union([z.number(), z.string()]).transform(val => typeof val === 'number' ? val : parseFloat(val || '0')).refine(val => val > 0, { message: 'Basic sale price must be positive' }),
  other_charges: z.union([z.number(), z.string()]).transform(val => typeof val === 'number' ? val : parseFloat(val || '0')).refine(val => val >= 0, { message: 'Other charges cannot be negative' }).optional().default(0),
  total_cost: z.union([z.number(), z.string()]).transform(val => typeof val === 'number' ? val : parseFloat(val || '0')).refine(val => val > 0, { message: 'Total cost must be positive' }),
  total_cost_override_reason: z.string().optional(),
  booking_amount_paid: z.union([z.number(), z.string()]).transform(val => typeof val === 'number' ? val : parseFloat(val || '0')).refine(val => val > 0, { message: 'Booking amount must be positive' }),
  payment_mode: z.enum(['Cash', 'Cheque', 'NEFT_RTGS', 'UPI']),
  payment_mode_detail: z.string().optional(),
  txn_or_cheque_no: z.string().optional(),
  txn_date: z.string().optional(),
  payment_plan_type: z.enum(['ConstructionLinked', 'DownPayment', 'PossessionLinked', 'Custom']),
  payment_plan_custom_text: z.string().optional(),
}).refine(
  (data) => {
    const autoTotal = data.basic_sale_price + (data.other_charges || 0)
    if (Math.abs(data.total_cost - autoTotal) > 0.01 && !data.total_cost_override_reason) {
      return false
    }
    return true
  },
  {
    message: 'Please provide a reason for overriding the total cost',
    path: ['total_cost_override_reason'],
  }
).refine(
  (data) => {
    if (data.payment_plan_type === 'Custom' && !data.payment_plan_custom_text) {
      return false
    }
    return true
  },
  {
    message: 'Please specify the custom payment plan',
    path: ['payment_plan_custom_text'],
  }
)

export const bookingSchema = z.object({
  ...step1Schema.shape,
  ...step2Schema.shape,
  ...step3Schema.shape,
})

export type Step1Data = z.infer<typeof step1Schema>
export type Step2Data = z.infer<typeof step2Schema>
export type Step3Data = z.infer<typeof step3Schema>
export type BookingFormData = z.infer<typeof bookingSchema>

