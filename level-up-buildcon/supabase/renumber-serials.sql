-- =============================================
-- Renumber serial numbers after permanently deleting soft-deleted bookings
-- Run this in Supabase SQL Editor AFTER you have run:
--   DELETE FROM bookings WHERE deleted_at IS NOT NULL;
-- This assigns serial_no 1, 2, 3, ... to remaining submitted/edited bookings
-- and updates serial_display (e.g. LUBC 01, LUBC 02) to match.
-- =============================================

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
