export type UserRole = 'STAFF' | 'EXECUTIVE' | 'ADMIN'
export type UserStatus = 'PENDING' | 'ACTIVE' | 'DISABLED'
export type BookingStatus = 'DRAFT' | 'SUBMITTED' | 'EDITED'
export type UnitCategory = 'Residential' | 'Commercial'
export type UnitType = 'Flat' | 'Villa' | 'Plot' | 'Shop' | 'Office' | 'Other'
export type PaymentMode = 'Cash' | 'Cheque' | 'NEFT_RTGS' | 'UPI'
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
  rera_regn_no?: string
  unit_category: UnitCategory
  unit_type: UnitType
  unit_type_other_text?: string
  unit_no: string
  floor_no?: string
  super_builtup_area?: number
  carpet_area?: number
  
  // Applicant
  applicant_name: string
  applicant_father_or_spouse: string
  applicant_mobile: string
  applicant_email?: string
  applicant_pan?: string
  applicant_aadhaar?: string
  applicant_address?: string
  
  // Co-applicant
  coapplicant_name?: string
  coapplicant_relationship?: string
  coapplicant_mobile?: string
  coapplicant_pan?: string
  coapplicant_aadhaar?: string
  
  // Pricing
  basic_sale_price: number
  other_charges: number
  total_cost: number
  total_cost_override_reason?: string
  booking_amount_paid: number
  payment_mode: PaymentMode
  payment_mode_detail?: string
  txn_or_cheque_no?: string
  txn_date?: string
  
  // Payment Plan
  payment_plan_type: PaymentPlanType
  payment_plan_custom_text?: string
  
  // System
  status: BookingStatus
  created_by: string
  created_at: string
  updated_at: string
  submitted_at?: string
}

export interface BookingFile {
  id: string
  booking_id: string
  file_type: 'company' | 'customer'
  file_path: string
  file_size?: number
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

// Joined types for display
export interface BookingWithCreator extends Booking {
  creator?: Profile
}

export interface AuditLogWithUser extends BookingAuditLog {
  user?: Profile
}

