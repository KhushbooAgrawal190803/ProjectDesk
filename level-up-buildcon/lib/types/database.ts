export type UserRole = 'EXECUTIVE' | 'ADMIN'
export type UserStatus = 'PENDING' | 'ACTIVE' | 'DISABLED'
export type BookingStatus = 'DRAFT' | 'PENDING' | 'SUBMITTED' | 'EDITED'
export type UnitCategory = 'Residential' | 'Commercial'
export type UnitType = 'Flat' | 'Villa' | 'Plot' | 'Shop' | 'Office' | 'Other'
export type PaymentMode = 'Cash' | 'Cheque' | 'NEFT_RTGS' | 'UPI' | 'Other'
export type PaymentPlanType = 'ConstructionLinked' | 'DownPayment' | 'PossessionLinked' | 'Custom'

export interface Profile {
  id: string
  full_name: string
  email: string
  role: UserRole
  status: UserStatus
  created_at: string
  updated_at: string
  last_login?: string
}

export interface Settings {
  id: string
  allow_self_signup: boolean
  serial_prefix: string
  default_project_location: string
  created_at: string
  updated_at: string
}

export interface Booking {
  id: string
  serial_no?: number
  serial_display?: string
  
  // Project & Unit
  project_name: string
  project_location: string
  project_address?: string
  rera_regn_no?: string
  building_permit_no?: string
  unit_category: UnitCategory
  unit_type: UnitType
  unit_type_other_text?: string
  unit_no: string
  floor_no?: string
  builtup_area?: number
  super_builtup_area?: number
  carpet_area?: number
  boundary_east?: string | null
  boundary_west?: string | null
  boundary_north?: string | null
  boundary_south?: string | null
  
  // Applicant
  applicant_name: string
  applicant_salutation?: string | null
  applicant_father_or_spouse: string
  applicant_mobile: string
  applicant_email?: string
  applicant_pan?: string
  applicant_aadhaar?: string
  applicant_address?: string
  applicant_address_line1?: string | null
  applicant_address_line2?: string | null
  applicant_city?: string | null
  applicant_state?: string | null
  applicant_pin_code?: string | null
  applicant_country?: string | null
  
  // Co-applicant
  coapplicant_name?: string
  coapplicant_relationship?: string
  coapplicant_mobile?: string
  coapplicant_pan?: string
  coapplicant_aadhaar?: string
  
  // Pricing
  rate_per_sqft?: number
  basic_sale_price: number
  other_charges: number
  total_cost: number
  total_cost_override_reason?: string
  gst_amount?: number
  gst_collected?: number
  total_parking_charges?: number
  total_property_value?: number
  noc_required?: boolean
  noc_bank_name?: string | null
  noc_addressee?: string | null
  noc_bank_address?: string | null
  noc_bank_address_line1?: string | null
  noc_bank_address_line2?: string | null
  noc_bank_city?: string | null
  noc_bank_state?: string | null
  noc_bank_pin_code?: string | null
  noc_bank_country?: string | null
  booking_amount_paid: number
  payment_mode: PaymentMode
  payment_mode_detail?: string
  txn_or_cheque_no?: string
  txn_date?: string
  allotment_date?: string | null
  agreement_for_sale_date?: string | null
  
  // Payment Plan
  payment_plan_type: PaymentPlanType
  payment_plan_custom_text?: string
  finance_scenario?: string | null
  finance_bank_name?: string | null
  finance_bank_branch?: string | null
  finance_bank_address?: string | null
  finance_loan_status?: string | null
  finance_purchaser_percent?: number | null
  finance_bank_percent?: number | null
  finance_split_scope?: string | null
  
  coapplicants?: Array<{
    id: string
    name?: string | null
    salutation?: string | null
    father_or_spouse?: string | null
    mobile?: string | null
    email?: string | null
    pan?: string | null
    aadhaar?: string | null
    address?: string | null
  }>
  parking_spaces?: Array<{ id: string; kind: string; quantity?: number | null; label?: string | null; price?: number | string | null }>
  schedule_rows?: Array<{
    label?: string | null
    trigger_type?: string | null
    milestone_date?: string | null
    calc_type?: string | null
    value?: number | string | null
    calculated_amount?: number | string | null
  }>

  // System
  status: BookingStatus
  created_by: string
  created_at: string
  updated_at: string
  submitted_at?: string
}

export type DocumentType = 'applicant_pan' | 'applicant_aadhaar' | 'coapplicant_pan' | 'coapplicant_aadhaar'

export interface BookingDocument {
  id: string
  booking_id: string
  document_type: DocumentType
  file_name: string
  file_path: string
  file_size?: number
  mime_type?: string
  uploaded_by: string
  created_at: string
}

export interface BookingAuditLog {
  id: string
  booking_id: string
  changed_by: string
  changed_at: string
  action: string
  diff_json?: any
  reason?: string
}

export interface AdminAuditLog {
  id: string
  admin_id: string
  action: string
  target_user_id?: string
  details?: any
  created_at: string
}

export interface PaymentSlab {
  id: number
  sr_no: number
  label: string
  percentage: number
}

export interface BookingPaymentSlab {
  id: string
  booking_id: string
  slab_id: number
  amount_due: number
  amount_received: number
  received_at?: string
  entered_by?: string
  notes?: string
  created_at: string
  updated_at: string
}

// Joined types for display
export interface BookingWithCreator extends Booking {
  creator?: Profile
}

export interface AuditLogWithUser extends BookingAuditLog {
  user?: Profile
}

