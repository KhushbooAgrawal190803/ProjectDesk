-- =============================================
-- CONSOLIDATED MIGRATION
-- Run this ONCE in Supabase SQL Editor
-- =============================================
-- This migration combines ALL pending changes:
-- 1. Deletes all bookings (clean start)
-- 2. Restructures user_role enum (STAFF → EXECUTIVE, add ACCOUNTS)
-- 3. Adds PENDING to booking_status enum
-- 4. Adds missing columns (gst_amount, rate_per_sqft, project_address, building_permit_no)
-- 5. Drops NOT NULL constraints (all booking fields now optional)
-- 6. Adds forgot_password_email to settings
-- 7. Updates serial number trigger for LUBC/001/R/unit format
-- 8. Updates RLS policies
-- 9. Makes admin_audit_log.admin_id nullable

BEGIN;

-- =============================================
-- STEP 1: Clean start — delete all bookings
-- =============================================
DELETE FROM booking_files;
DELETE FROM booking_audit_log;
DELETE FROM booking_documents;
DELETE FROM bookings;

-- Reset sequences
ALTER SEQUENCE IF EXISTS booking_serial_seq RESTART WITH 1;

-- =============================================
-- STEP 2: Update user_role enum
-- =============================================

-- Convert existing STAFF users to EXECUTIVE first
UPDATE profiles SET role = 'EXECUTIVE' WHERE role = 'STAFF';

-- Rename old enum
ALTER TYPE user_role RENAME TO user_role_old;

-- Create new enum with correct values
CREATE TYPE user_role AS ENUM ('EXECUTIVE', 'ACCOUNTS', 'ADMIN');

-- Update profiles column to use new enum
ALTER TABLE profiles ALTER COLUMN role TYPE user_role USING role::text::user_role;
ALTER TABLE profiles ALTER COLUMN role SET DEFAULT 'EXECUTIVE';

-- Drop old enum
DROP TYPE user_role_old;

-- =============================================
-- STEP 3: Add PENDING to booking_status enum
-- =============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'PENDING' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'booking_status')
  ) THEN
    ALTER TYPE booking_status ADD VALUE 'PENDING' AFTER 'DRAFT';
  END IF;
END
$$;

COMMIT;

-- Need a new transaction after ADD VALUE (PostgreSQL requirement)
BEGIN;

-- =============================================
-- STEP 4: Add missing columns to bookings
-- =============================================

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS gst_amount NUMERIC(12, 2);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS rate_per_sqft NUMERIC(12, 2);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS project_address TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS building_permit_no TEXT;

-- =============================================
-- STEP 5: Drop NOT NULL constraints on booking fields
-- (All form fields are now optional)
-- =============================================

ALTER TABLE bookings ALTER COLUMN project_name DROP NOT NULL;
ALTER TABLE bookings ALTER COLUMN unit_category DROP NOT NULL;
ALTER TABLE bookings ALTER COLUMN unit_type DROP NOT NULL;
ALTER TABLE bookings ALTER COLUMN unit_no DROP NOT NULL;
ALTER TABLE bookings ALTER COLUMN applicant_name DROP NOT NULL;
ALTER TABLE bookings ALTER COLUMN applicant_father_or_spouse DROP NOT NULL;
ALTER TABLE bookings ALTER COLUMN applicant_mobile DROP NOT NULL;
ALTER TABLE bookings ALTER COLUMN basic_sale_price DROP NOT NULL;
ALTER TABLE bookings ALTER COLUMN total_cost DROP NOT NULL;
ALTER TABLE bookings ALTER COLUMN booking_amount_paid DROP NOT NULL;
ALTER TABLE bookings ALTER COLUMN payment_mode DROP NOT NULL;
ALTER TABLE bookings ALTER COLUMN payment_plan_type DROP NOT NULL;

-- Drop CHECK constraints that may conflict with nullable fields
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS check_unit_type_other;
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS check_payment_plan_custom;

-- =============================================
-- STEP 6: Add forgot_password_email to settings
-- =============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'settings' AND column_name = 'forgot_password_email'
  ) THEN
    ALTER TABLE settings ADD COLUMN forgot_password_email TEXT NOT NULL DEFAULT 'agkhushboo43@gmail.com';
  END IF;
END
$$;

UPDATE settings SET forgot_password_email = 'agkhushboo43@gmail.com' 
WHERE forgot_password_email IS NULL OR forgot_password_email = '';

-- =============================================
-- STEP 7: New serial number sequence + trigger
-- Format: LUBC/001/R/101 or LUBC/002/C/5
-- Also handles PENDING → SUBMITTED (approval)
-- =============================================

CREATE SEQUENCE IF NOT EXISTS booking_serial_lubc_seq START 1;

CREATE OR REPLACE FUNCTION generate_serial_number()
RETURNS TRIGGER AS $$
DECLARE
  seq_val INTEGER;
  category_code TEXT;
BEGIN
  -- Generate serial when:
  -- 1. INSERT with status='SUBMITTED' (ADMIN direct submit)
  -- 2. UPDATE from DRAFT → SUBMITTED
  -- 3. UPDATE from PENDING → SUBMITTED (approval)
  IF NEW.serial_no IS NULL AND NEW.status = 'SUBMITTED' THEN
    IF TG_OP = 'INSERT' 
       OR (TG_OP = 'UPDATE' AND OLD.status = 'DRAFT') 
       OR (TG_OP = 'UPDATE' AND OLD.status = 'PENDING') THEN
      
      seq_val := nextval('booking_serial_lubc_seq');
      NEW.serial_no := seq_val;
      
      -- Determine category code
      IF NEW.unit_category = 'Commercial' THEN
        category_code := 'C';
      ELSE
        category_code := 'R';
      END IF;
      
      -- Format: LUBC/001/R/flat_number
      NEW.serial_display := 'LUBC/' || LPAD(seq_val::TEXT, 3, '0') || '/' || category_code || '/' || COALESCE(NEW.unit_no, 'N/A');
      NEW.submitted_at := NOW();
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- STEP 8: Update RLS policies
-- =============================================

-- Drop old STAFF-based policy
DROP POLICY IF EXISTS "Staff can update own draft bookings" ON bookings;

-- Create new policy: any active user can update their own drafts
CREATE POLICY "Users can update own draft bookings"
  ON bookings
  FOR UPDATE
  USING (
    created_by = auth.uid()
    AND status IN ('DRAFT', 'PENDING')
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND status = 'ACTIVE'
    )
  );

-- Drop and recreate admin audit log insert policy (for nullable admin_id)
DROP POLICY IF EXISTS "System can insert admin audit logs" ON admin_audit_log;

CREATE POLICY "System can insert admin audit logs"
  ON admin_audit_log FOR INSERT
  WITH CHECK (true);

-- =============================================
-- STEP 9: Make admin_audit_log.admin_id nullable
-- =============================================

ALTER TABLE admin_audit_log ALTER COLUMN admin_id DROP NOT NULL;

COMMIT;

-- =============================================
-- VERIFICATION (run separately to check)
-- =============================================
-- SELECT column_name, is_nullable, data_type 
-- FROM information_schema.columns 
-- WHERE table_name = 'bookings' 
-- ORDER BY ordinal_position;
