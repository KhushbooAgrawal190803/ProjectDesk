-- =============================================
-- Migration: New Serial Format + GST Amount
-- =============================================

-- 1. Add gst_amount column
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS gst_amount NUMERIC(12, 2);

-- 2. Add rate_per_sqft column (if not already added)
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS rate_per_sqft NUMERIC(12, 2);

-- 3. Create a single shared sequence for the new serial format
-- (We'll use a new sequence so existing data isn't affected)
CREATE SEQUENCE IF NOT EXISTS booking_serial_lubc_seq START 1;

-- 4. Update the serial number generation function
-- New format: LUBC/001/R/101 (for Residential)
--             LUBC/002/C/5   (for Commercial)
CREATE OR REPLACE FUNCTION generate_serial_number()
RETURNS TRIGGER AS $$
DECLARE
  seq_val INTEGER;
  category_code TEXT;
BEGIN
  IF NEW.serial_no IS NULL AND NEW.status = 'SUBMITTED' THEN
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status = 'DRAFT') THEN
      -- Compute next serial number from existing active (non-deleted) submitted bookings
      SELECT COALESCE(MAX(serial_no), 0) + 1
      INTO seq_val
      FROM bookings
      WHERE deleted_at IS NULL
        AND status = 'SUBMITTED';

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

-- Note: Existing triggers (generate_booking_serial_insert and 
-- generate_booking_serial_update) will automatically use the updated function.

-- 5. OPTIONAL: If you want to reset the sequence to start from 1:
-- ALTER SEQUENCE booking_serial_lubc_seq RESTART WITH 1;
--
-- 6. OPTIONAL: If you want to re-number existing bookings with the new format:
-- UPDATE bookings SET serial_display = 'LUBC/' || LPAD(serial_no::TEXT, 3, '0') || '/' || 
--   CASE WHEN unit_category = 'Commercial' THEN 'C' ELSE 'R' END || '/' || COALESCE(unit_no, 'N/A')
-- WHERE serial_no IS NOT NULL;
