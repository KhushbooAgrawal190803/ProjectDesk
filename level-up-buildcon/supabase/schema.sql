-- =============================================
-- Level Up Buildcon - Database Schema
-- =============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- ENUMS
-- =============================================

CREATE TYPE user_role AS ENUM ('STAFF', 'EXECUTIVE', 'ADMIN');
CREATE TYPE user_status AS ENUM ('PENDING', 'ACTIVE', 'DISABLED');
CREATE TYPE booking_status AS ENUM ('DRAFT', 'SUBMITTED', 'EDITED');
CREATE TYPE unit_category AS ENUM ('Residential', 'Commercial');
CREATE TYPE unit_type AS ENUM ('Flat', 'Villa', 'Plot', 'Shop', 'Office', 'Other');
CREATE TYPE payment_mode AS ENUM ('Cash', 'Cheque', 'NEFT_RTGS', 'UPI');
CREATE TYPE payment_plan_type AS ENUM ('ConstructionLinked', 'DownPayment', 'PossessionLinked', 'Custom');

-- =============================================
-- PROFILES TABLE
-- =============================================

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role user_role NOT NULL DEFAULT 'STAFF',
  status user_status NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login TIMESTAMPTZ
);

-- Create index for faster lookups
CREATE INDEX idx_profiles_email ON profiles(email);
CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_profiles_status ON profiles(status);

-- =============================================
-- SYSTEM SETTINGS TABLE
-- =============================================

CREATE TABLE settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  allow_self_signup BOOLEAN NOT NULL DEFAULT false,
  serial_prefix TEXT NOT NULL DEFAULT 'LUBC-',
  default_project_location TEXT NOT NULL DEFAULT 'Ranchi, Jharkhand',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default settings
INSERT INTO settings (allow_self_signup, serial_prefix, default_project_location)
VALUES (false, 'LUBC-', 'Ranchi, Jharkhand');

-- =============================================
-- BOOKINGS TABLE
-- =============================================

CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Serial number (generated on submit)
  serial_no INTEGER UNIQUE,
  serial_display TEXT,
  
  -- Project & Unit Information
  project_name TEXT NOT NULL,
  project_location TEXT NOT NULL DEFAULT 'Ranchi, Jharkhand',
  rera_regn_no TEXT,
  unit_category unit_category NOT NULL,
  unit_type unit_type NOT NULL,
  unit_type_other_text TEXT,
  unit_no TEXT NOT NULL,
  floor_no TEXT,
  super_builtup_area NUMERIC(10, 2),
  carpet_area NUMERIC(10, 2),
  
  -- Applicant Information
  applicant_name TEXT NOT NULL,
  applicant_father_or_spouse TEXT NOT NULL,
  applicant_mobile TEXT NOT NULL,
  applicant_email TEXT,
  applicant_pan TEXT,
  applicant_aadhaar TEXT,
  applicant_address TEXT,
  
  -- Co-applicant (optional)
  coapplicant_name TEXT,
  coapplicant_relationship TEXT,
  coapplicant_mobile TEXT,
  coapplicant_pan TEXT,
  coapplicant_aadhaar TEXT,
  
  -- Pricing & Payment
  basic_sale_price NUMERIC(12, 2) NOT NULL,
  other_charges NUMERIC(12, 2) DEFAULT 0,
  total_cost NUMERIC(12, 2) NOT NULL,
  total_cost_override_reason TEXT,
  booking_amount_paid NUMERIC(12, 2) NOT NULL,
  payment_mode payment_mode NOT NULL,
  payment_mode_detail TEXT,
  txn_or_cheque_no TEXT,
  txn_date DATE,
  
  -- Payment Plan
  payment_plan_type payment_plan_type NOT NULL,
  payment_plan_custom_text TEXT,
  
  -- System fields
  status booking_status NOT NULL DEFAULT 'DRAFT',
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  
  -- Constraints
  CONSTRAINT check_unit_type_other CHECK (
    (unit_type != 'Other' AND unit_type_other_text IS NULL) OR
    (unit_type = 'Other' AND unit_type_other_text IS NOT NULL)
  ),
  CONSTRAINT check_payment_plan_custom CHECK (
    (payment_plan_type != 'Custom' AND payment_plan_custom_text IS NULL) OR
    (payment_plan_type = 'Custom' AND payment_plan_custom_text IS NOT NULL)
  )
);

-- Create sequence for serial numbers
CREATE SEQUENCE booking_serial_seq START 1;

-- Create indexes for better performance
CREATE INDEX idx_bookings_serial ON bookings(serial_no);
CREATE INDEX idx_bookings_applicant_name ON bookings(applicant_name);
CREATE INDEX idx_bookings_applicant_mobile ON bookings(applicant_mobile);
CREATE INDEX idx_bookings_project_name ON bookings(project_name);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_created_by ON bookings(created_by);
CREATE INDEX idx_bookings_created_at ON bookings(created_at DESC);

-- =============================================
-- BOOKING FILES TABLE
-- =============================================

CREATE TABLE booking_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  file_type TEXT NOT NULL, -- 'company' or 'customer'
  file_path TEXT NOT NULL,
  file_size INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_booking_files_booking_id ON booking_files(booking_id);

-- =============================================
-- BOOKING AUDIT LOG TABLE
-- =============================================

CREATE TABLE booking_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  changed_by UUID NOT NULL REFERENCES profiles(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  action TEXT NOT NULL, -- 'CREATED', 'EDITED', 'STATUS_CHANGED'
  diff_json JSONB,
  reason TEXT
);

CREATE INDEX idx_audit_log_booking_id ON booking_audit_log(booking_id);
CREATE INDEX idx_audit_log_changed_by ON booking_audit_log(changed_by);
CREATE INDEX idx_audit_log_changed_at ON booking_audit_log(changed_at DESC);

-- =============================================
-- ADMIN AUDIT LOG TABLE
-- =============================================

CREATE TABLE admin_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id UUID NOT NULL REFERENCES profiles(id),
  action TEXT NOT NULL, -- 'USER_APPROVED', 'ROLE_CHANGED', 'USER_DISABLED', etc.
  target_user_id UUID REFERENCES profiles(id),
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_admin_audit_log_admin_id ON admin_audit_log(admin_id);
CREATE INDEX idx_admin_audit_log_created_at ON admin_audit_log(created_at DESC);

-- =============================================
-- FUNCTIONS
-- =============================================

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to tables
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bookings_updated_at BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to generate serial number and display format
CREATE OR REPLACE FUNCTION generate_serial_number()
RETURNS TRIGGER AS $$
DECLARE
  prefix TEXT;
BEGIN
  -- Generate serial number if:
  -- 1. Inserting with status='SUBMITTED' and serial_no is null, OR
  -- 2. Updating from DRAFT to SUBMITTED and serial_no is null
  IF NEW.serial_no IS NULL AND NEW.status = 'SUBMITTED' THEN
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status = 'DRAFT') THEN
      -- Get the prefix from settings
      SELECT serial_prefix INTO prefix FROM settings LIMIT 1;
      
      -- Generate next serial number
      NEW.serial_no := nextval('booking_serial_seq');
      NEW.serial_display := prefix || LPAD(NEW.serial_no::TEXT, 6, '0');
      NEW.submitted_at := NOW();
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER generate_booking_serial_insert BEFORE INSERT ON bookings
  FOR EACH ROW EXECUTE FUNCTION generate_serial_number();

CREATE TRIGGER generate_booking_serial_update BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION generate_serial_number();

-- =============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

-- =============================================
-- PROFILES POLICIES
-- =============================================

-- Users can read their own profile
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Users can update their own profile (limited fields)
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Admins can view all profiles
CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'ADMIN' AND status = 'ACTIVE'
    )
  );

-- Admins can update any profile
CREATE POLICY "Admins can update profiles"
  ON profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'ADMIN' AND status = 'ACTIVE'
    )
  );

-- Admins can insert profiles (user creation)
CREATE POLICY "Admins can create profiles"
  ON profiles FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'ADMIN' AND status = 'ACTIVE'
    )
  );

-- =============================================
-- SETTINGS POLICIES
-- =============================================

-- All authenticated users can read settings
CREATE POLICY "Authenticated users can view settings"
  ON settings FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Only admins can update settings
CREATE POLICY "Admins can update settings"
  ON settings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'ADMIN' AND status = 'ACTIVE'
    )
  );

-- =============================================
-- BOOKINGS POLICIES
-- =============================================

-- All active users can view bookings
CREATE POLICY "Active users can view bookings"
  ON bookings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND status = 'ACTIVE'
    )
  );

-- All active users can create bookings
CREATE POLICY "Active users can create bookings"
  ON bookings FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND status = 'ACTIVE'
    ) AND created_by = auth.uid()
  );

-- STAFF can only update their own DRAFT bookings
CREATE POLICY "Staff can update own draft bookings"
  ON bookings FOR UPDATE
  USING (
    created_by = auth.uid() AND
    status = 'DRAFT' AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'STAFF' AND status = 'ACTIVE'
    )
  );

-- EXECUTIVE and ADMIN can update any booking
CREATE POLICY "Executives and admins can update bookings"
  ON bookings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('EXECUTIVE', 'ADMIN') AND status = 'ACTIVE'
    )
  );

-- =============================================
-- BOOKING FILES POLICIES
-- =============================================

-- Users can view files for bookings they can view
CREATE POLICY "Users can view booking files"
  ON booking_files FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM bookings
      WHERE bookings.id = booking_files.booking_id
      AND EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND status = 'ACTIVE'
      )
    )
  );

-- System can insert files (via service role)
CREATE POLICY "Service role can insert files"
  ON booking_files FOR INSERT
  WITH CHECK (true);

-- =============================================
-- AUDIT LOG POLICIES
-- =============================================

-- Users can view audit logs for bookings they can view
CREATE POLICY "Users can view booking audit logs"
  ON booking_audit_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM bookings
      WHERE bookings.id = booking_audit_log.booking_id
      AND EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND status = 'ACTIVE'
      )
    )
  );

-- System can insert audit logs
CREATE POLICY "System can insert audit logs"
  ON booking_audit_log FOR INSERT
  WITH CHECK (changed_by = auth.uid());

-- Admins can view all admin audit logs
CREATE POLICY "Admins can view admin audit logs"
  ON admin_audit_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'ADMIN' AND status = 'ACTIVE'
    )
  );

-- System can insert admin audit logs
CREATE POLICY "System can insert admin audit logs"
  ON admin_audit_log FOR INSERT
  WITH CHECK (admin_id = auth.uid());

-- =============================================
-- STORAGE BUCKETS
-- =============================================

-- Create storage bucket for PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('bookings', 'bookings', false);

-- Storage policies for bookings bucket
CREATE POLICY "Authenticated users can read booking files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'bookings' AND
    auth.uid() IS NOT NULL
  );

CREATE POLICY "Service role can upload booking files"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'bookings');

CREATE POLICY "Service role can delete booking files"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'bookings');

