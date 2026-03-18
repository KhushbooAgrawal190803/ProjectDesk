-- =============================================
-- Reset booking serial format to: "LUBC 01", "LUBC 02", ...
-- 1) Sets default prefix to "LUBC "
-- 2) Replaces generate_serial_number() to use MAX(serial_no)+1
--    and serial_display = prefix || LPAD(serial_no, 2, '0')
-- 3) Resets existing bookings serial_no/serial_display starting from 1
-- =============================================

BEGIN;

-- Ensure the prefix is the simple desired format
UPDATE settings
SET serial_prefix = 'LUBC '
WHERE serial_prefix IS NULL OR serial_prefix <> 'LUBC ';

-- Replace generator to use the simple format
CREATE OR REPLACE FUNCTION generate_serial_number()
RETURNS TRIGGER AS $$
DECLARE
  prefix TEXT;
  next_serial INTEGER;
BEGIN
  IF NEW.serial_no IS NULL AND NEW.status = 'SUBMITTED' THEN
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND (OLD.status = 'DRAFT' OR OLD.status = 'PENDING')) THEN
      SELECT COALESCE(MAX(serial_no), 0) + 1
      INTO next_serial
      FROM bookings
      WHERE deleted_at IS NULL
        AND status IN ('SUBMITTED', 'EDITED')
        AND serial_no IS NOT NULL;

      SELECT serial_prefix INTO prefix FROM settings LIMIT 1;

      NEW.serial_no := next_serial;
      NEW.serial_display := prefix || LPAD(NEW.serial_no::TEXT, 2, '0');
      NEW.submitted_at := NOW();
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Renumber existing bookings (active submitted/edited) back from 01
WITH ordered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (ORDER BY COALESCE(submitted_at, created_at), id) AS new_serial
  FROM bookings
  WHERE deleted_at IS NULL
    AND status IN ('SUBMITTED', 'EDITED')
)
UPDATE bookings b
SET
  serial_no = o.new_serial,
  serial_display = (SELECT serial_prefix FROM settings LIMIT 1) || LPAD(o.new_serial::TEXT, 2, '0')
FROM ordered o
WHERE b.id = o.id;

COMMIT;

