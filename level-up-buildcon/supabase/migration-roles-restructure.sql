-- Migration: Role System Restructuring
-- Run this in Supabase SQL Editor
-- This migration:
-- 1. Adds ACCOUNTS to user_role enum, removes STAFF
-- 2. Adds PENDING to booking_status enum
-- 3. Adds forgot_password_email to settings
-- 4. Converts existing STAFF users to EXECUTIVE
-- 5. Removes all existing bookings (as requested)

-- =============================================
-- STEP 1: Remove all existing bookings
-- =============================================
DELETE FROM booking_documents;
DELETE FROM booking_audit_log;
DELETE FROM bookings;

-- Reset the booking serial sequence
ALTER SEQUENCE IF EXISTS booking_serial_seq RESTART WITH 1;

-- =============================================
-- STEP 2: Update user_role enum (add ACCOUNTS, migrate STAFF → EXECUTIVE)
-- =============================================

-- First, update any existing STAFF users to EXECUTIVE
UPDATE profiles SET role = 'EXECUTIVE' WHERE role = 'STAFF';

-- Rename the old enum
ALTER TYPE user_role RENAME TO user_role_old;

-- Create new enum
CREATE TYPE user_role AS ENUM ('EXECUTIVE', 'ACCOUNTS', 'ADMIN');

-- Update the column to use the new enum
ALTER TABLE profiles ALTER COLUMN role TYPE user_role USING role::text::user_role;

-- Set new default
ALTER TABLE profiles ALTER COLUMN role SET DEFAULT 'EXECUTIVE';

-- Drop old enum
DROP TYPE user_role_old;

-- =============================================
-- STEP 3: Update booking_status enum (add PENDING)
-- =============================================

-- Check if PENDING already exists, if not add it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'PENDING' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'booking_status')
  ) THEN
    -- Add PENDING after DRAFT
    ALTER TYPE booking_status ADD VALUE 'PENDING' AFTER 'DRAFT';
  END IF;
END
$$;

-- =============================================
-- STEP 4: Add forgot_password_email to settings
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

-- Update existing settings row
UPDATE settings SET forgot_password_email = 'agkhushboo43@gmail.com' WHERE forgot_password_email IS NULL OR forgot_password_email = '';

-- =============================================
-- STEP 5: Update RLS policies for new roles
-- =============================================

-- Drop and recreate the staff policy to use EXECUTIVE
DROP POLICY IF EXISTS "Staff can update own draft bookings" ON bookings;

CREATE POLICY "Users can update own draft bookings"
  ON bookings
  FOR UPDATE
  USING (
    created_by = auth.uid()
    AND status = 'DRAFT'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND status = 'ACTIVE'
    )
  );

-- =============================================
-- STEP 6: Allow nullable admin_id in audit log for system actions
-- =============================================

-- Make admin_id nullable in admin_audit_log for system-generated entries (like forgot password requests)
ALTER TABLE admin_audit_log ALTER COLUMN admin_id DROP NOT NULL;

-- =============================================
-- DONE
-- =============================================
-- Summary of changes:
-- - All bookings, documents, and audit logs deleted
-- - STAFF users converted to EXECUTIVE
-- - user_role enum: EXECUTIVE, ACCOUNTS, ADMIN
-- - booking_status enum: DRAFT, PENDING, SUBMITTED, EDITED
-- - settings.forgot_password_email added (default: agkhushboo43@gmail.com)
-- - RLS policy updated for new role names
-- - admin_audit_log.admin_id now nullable
