-- =============================================
-- Migration: Serial Number Format + New Fields
-- =============================================

-- 1. Add new columns to bookings table
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS building_permit_no TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS project_address TEXT;

-- 2. Create separate sequences for Residential and Commercial
CREATE SEQUENCE IF NOT EXISTS booking_serial_residential_seq START 1;
CREATE SEQUENCE IF NOT EXISTS booking_serial_commercial_seq START 1;

-- 3. Update the serial number generation function
-- Format: R-01 for Residential, C-01 for Commercial (2-digit padding for 70 units)
CREATE OR REPLACE FUNCTION generate_serial_number()
RETURNS TRIGGER AS $$
DECLARE
  seq_val INTEGER;
BEGIN
  IF NEW.serial_no IS NULL AND NEW.status = 'SUBMITTED' THEN
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status = 'DRAFT') THEN
      -- Use different sequence based on unit_category
      IF NEW.unit_category = 'Commercial' THEN
        seq_val := nextval('booking_serial_commercial_seq');
        NEW.serial_no := seq_val;
        NEW.serial_display := 'C-' || LPAD(seq_val::TEXT, 2, '0');
      ELSE
        seq_val := nextval('booking_serial_residential_seq');
        NEW.serial_no := seq_val;
        NEW.serial_display := 'R-' || LPAD(seq_val::TEXT, 2, '0');
      END IF;
      NEW.submitted_at := NOW();
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Note: The existing triggers (generate_booking_serial_insert and 
-- generate_booking_serial_update) will use the updated function automatically.

-- 4. To reset serial numbers and remove previously deleted versions:
-- Run these ONLY if you want to start fresh:
-- 
-- DELETE FROM booking_files WHERE booking_id IN (SELECT id FROM bookings WHERE deleted_at IS NOT NULL);
-- DELETE FROM booking_audit_log WHERE booking_id IN (SELECT id FROM bookings WHERE deleted_at IS NOT NULL);
-- DELETE FROM bookings WHERE deleted_at IS NOT NULL;
-- 
-- To reset sequences to start from 1:
-- ALTER SEQUENCE booking_serial_residential_seq RESTART WITH 1;
-- ALTER SEQUENCE booking_serial_commercial_seq RESTART WITH 1;
