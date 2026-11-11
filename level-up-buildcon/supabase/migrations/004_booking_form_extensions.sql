-- Booking form extensions: boundaries, structured addresses, co-applicants,
-- parking spaces with prices, GST collected, bank NOC, and payment schedule.
-- Safe to run once on an existing database. Does not delete booking rows.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS boundary_east TEXT,
  ADD COLUMN IF NOT EXISTS boundary_west TEXT,
  ADD COLUMN IF NOT EXISTS boundary_north TEXT,
  ADD COLUMN IF NOT EXISTS boundary_south TEXT,
  ADD COLUMN IF NOT EXISTS applicant_address_line1 TEXT,
  ADD COLUMN IF NOT EXISTS applicant_address_line2 TEXT,
  ADD COLUMN IF NOT EXISTS applicant_city TEXT,
  ADD COLUMN IF NOT EXISTS applicant_state TEXT,
  ADD COLUMN IF NOT EXISTS applicant_pin_code TEXT,
  ADD COLUMN IF NOT EXISTS applicant_country TEXT,
  ADD COLUMN IF NOT EXISTS gst_collected NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_parking_charges NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_property_value NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS noc_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS applicant_salutation TEXT,
  ADD COLUMN IF NOT EXISTS noc_bank_name TEXT,
  ADD COLUMN IF NOT EXISTS noc_addressee TEXT,
  ADD COLUMN IF NOT EXISTS noc_bank_address TEXT,
  ADD COLUMN IF NOT EXISTS noc_bank_address_line1 TEXT,
  ADD COLUMN IF NOT EXISTS noc_bank_address_line2 TEXT,
  ADD COLUMN IF NOT EXISTS noc_bank_city TEXT,
  ADD COLUMN IF NOT EXISTS noc_bank_state TEXT,
  ADD COLUMN IF NOT EXISTS noc_bank_pin_code TEXT,
  ADD COLUMN IF NOT EXISTS noc_bank_country TEXT;

CREATE TABLE IF NOT EXISTS booking_coapplicants (
  id UUID PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  name TEXT,
  salutation TEXT,
  father_or_spouse TEXT,
  mobile TEXT,
  email TEXT,
  pan TEXT,
  aadhaar TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  pin_code TEXT,
  country TEXT,
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_coapplicants_booking
  ON booking_coapplicants(booking_id, sort_order);

ALTER TABLE booking_coapplicants ADD COLUMN IF NOT EXISTS salutation TEXT;

ALTER TABLE booking_documents
  ADD COLUMN IF NOT EXISTS coapplicant_id UUID REFERENCES booking_coapplicants(id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS booking_parking_spaces (
  id UUID PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL CHECK (kind IN ('main', 'secondary')),
  quantity INTEGER NOT NULL DEFAULT 1,
  label TEXT,
  price NUMERIC(14, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_parking_spaces_booking
  ON booking_parking_spaces(booking_id, sort_order);

ALTER TABLE booking_parking_spaces ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS booking_schedule_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('milestone', 'date')),
  label TEXT,
  milestone_date DATE,
  calc_type TEXT NOT NULL CHECK (calc_type IN ('percentage', 'fixed')),
  value NUMERIC(14, 2) NOT NULL,
  calculated_amount NUMERIC(14, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_schedule_rows_booking
  ON booking_schedule_rows(booking_id, sort_order);

-- Parking inventory: 79 main + 27 secondary.
-- Existing additional_parking counts as main, premium_parking as secondary.
-- The lock serializes concurrent submits. Rows whose parking counts did not
-- change (and that were already non-draft) are not re-checked, so a project
-- that is already over the cap can still be edited.
CREATE OR REPLACE FUNCTION enforce_parking_inventory()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  used_main INTEGER;
  used_secondary INTEGER;
BEGIN
  IF NEW.deleted_at IS NOT NULL OR NEW.status = 'DRAFT' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.additional_parking IS NOT DISTINCT FROM OLD.additional_parking
     AND NEW.premium_parking IS NOT DISTINCT FROM OLD.premium_parking
     AND OLD.status IS DISTINCT FROM 'DRAFT'
     AND OLD.deleted_at IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('bookings.parking'));

  SELECT COALESCE(SUM(additional_parking), 0), COALESCE(SUM(premium_parking), 0)
    INTO used_main, used_secondary
  FROM bookings
  WHERE deleted_at IS NULL
    AND status <> 'DRAFT'
    AND id <> NEW.id;

  IF used_main + COALESCE(NEW.additional_parking, 0) > 79 THEN
    RAISE EXCEPTION 'Not enough main parking spaces remain (% of 79 already allocated)', used_main
      USING ERRCODE = '23514';
  END IF;

  IF used_secondary + COALESCE(NEW.premium_parking, 0) > 27 THEN
    RAISE EXCEPTION 'Not enough secondary parking spaces remain (% of 27 already allocated)', used_secondary
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_parking_inventory ON bookings;
CREATE TRIGGER enforce_parking_inventory
  BEFORE INSERT OR UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION enforce_parking_inventory();

ALTER TABLE booking_coapplicants ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_parking_spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_schedule_rows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS booking_coapplicants_staff_all ON booking_coapplicants;
CREATE POLICY booking_coapplicants_staff_all ON booking_coapplicants
  FOR ALL USING (is_active_staff()) WITH CHECK (is_active_staff());

DROP POLICY IF EXISTS booking_parking_spaces_staff_all ON booking_parking_spaces;
CREATE POLICY booking_parking_spaces_staff_all ON booking_parking_spaces
  FOR ALL USING (is_active_staff()) WITH CHECK (is_active_staff());

DROP POLICY IF EXISTS booking_schedule_rows_staff_all ON booking_schedule_rows;
CREATE POLICY booking_schedule_rows_staff_all ON booking_schedule_rows
  FOR ALL USING (is_active_staff()) WITH CHECK (is_active_staff());

GRANT SELECT, INSERT, UPDATE, DELETE ON booking_coapplicants TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON booking_parking_spaces TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON booking_schedule_rows TO authenticated, service_role;
GRANT ALL ON booking_coapplicants TO postgres, service_role;
GRANT ALL ON booking_parking_spaces TO postgres, service_role;
GRANT ALL ON booking_schedule_rows TO postgres, service_role;
