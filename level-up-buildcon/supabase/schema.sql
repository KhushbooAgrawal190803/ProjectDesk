-- =============================================================================
-- ProjectDesk — Canonical fresh-install schema (EXECUTIVE + ADMIN roles only)
-- Run this entire file in Supabase SQL Editor on a new project.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------
-- ENUMS
-- -----------------------------------------------------------------------------

CREATE TYPE user_role AS ENUM ('EXECUTIVE', 'ADMIN');
CREATE TYPE user_status AS ENUM ('PENDING', 'ACTIVE', 'DISABLED');
CREATE TYPE booking_status AS ENUM ('DRAFT', 'PENDING', 'SUBMITTED', 'EDITED');
CREATE TYPE unit_category AS ENUM ('Residential', 'Commercial');
CREATE TYPE unit_type AS ENUM ('Flat', 'Villa', 'Plot', 'Shop', 'Office', 'Other');
CREATE TYPE payment_mode AS ENUM ('Cash', 'Cheque', 'NEFT_RTGS', 'UPI', 'Other');
CREATE TYPE payment_plan_type AS ENUM ('ConstructionLinked', 'DownPayment', 'PossessionLinked', 'Custom');

-- -----------------------------------------------------------------------------
-- PROFILES
-- -----------------------------------------------------------------------------

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role user_role NOT NULL DEFAULT 'EXECUTIVE',
  status user_status NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login TIMESTAMPTZ
);

CREATE INDEX idx_profiles_email ON profiles(email);
CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_profiles_status ON profiles(status);

-- -----------------------------------------------------------------------------
-- SETTINGS (singleton)
-- -----------------------------------------------------------------------------

CREATE TABLE settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  allow_self_signup BOOLEAN NOT NULL DEFAULT false,
  serial_prefix TEXT NOT NULL DEFAULT 'LUBC ',
  default_project_location TEXT NOT NULL DEFAULT 'Ranchi, Jharkhand',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Exactly one settings row; serial generation reads it with LIMIT 1.
CREATE UNIQUE INDEX idx_settings_singleton ON settings ((true));

INSERT INTO settings (allow_self_signup, serial_prefix, default_project_location)
VALUES (false, 'LUBC ', 'Ranchi, Jharkhand');

-- -----------------------------------------------------------------------------
-- BOOKINGS
-- -----------------------------------------------------------------------------

CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  serial_no INTEGER UNIQUE,
  serial_display TEXT,
  project_name TEXT,
  project_location TEXT DEFAULT 'Ranchi, Jharkhand',
  project_address TEXT,
  rera_regn_no TEXT,
  building_permit_no TEXT,
  unit_category unit_category,
  unit_type unit_type DEFAULT 'Flat',
  unit_type_other_text TEXT,
  unit_no TEXT,
  floor_no TEXT,
  builtup_area NUMERIC(10, 2),
  super_builtup_area NUMERIC(10, 2),
  carpet_area NUMERIC(10, 2),
  applicant_name TEXT,
  applicant_salutation TEXT,
  applicant_father_or_spouse TEXT,
  applicant_mobile TEXT,
  applicant_email TEXT,
  applicant_pan TEXT,
  applicant_aadhaar TEXT,
  applicant_address TEXT,
  coapplicant_name TEXT,
  coapplicant_relationship TEXT,
  coapplicant_mobile TEXT,
  coapplicant_pan TEXT,
  coapplicant_aadhaar TEXT,
  rate_per_sqft NUMERIC(12, 2),
  basic_sale_price NUMERIC(12, 2),
  other_charges NUMERIC(12, 2) DEFAULT 0,
  total_cost NUMERIC(12, 2),
  total_cost_override_reason TEXT,
  gst_amount NUMERIC(12, 2),
  booking_amount_paid NUMERIC(12, 2),
  payment_mode payment_mode,
  payment_mode_detail TEXT,
  txn_or_cheque_no TEXT,
  txn_date DATE,
  allotment_date DATE,
  agreement_for_sale_date DATE,
  payment_plan_type payment_plan_type,
  payment_plan_custom_text TEXT,
  additional_parking INTEGER NOT NULL DEFAULT 0,
  premium_parking INTEGER NOT NULL DEFAULT 0,
  boundary_east TEXT,
  boundary_west TEXT,
  boundary_north TEXT,
  boundary_south TEXT,
  applicant_address_line1 TEXT,
  applicant_address_line2 TEXT,
  applicant_city TEXT,
  applicant_state TEXT,
  applicant_pin_code TEXT,
  applicant_country TEXT,
  gst_collected NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_parking_charges NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_property_value NUMERIC(14, 2),
  noc_required BOOLEAN NOT NULL DEFAULT false,
  noc_bank_name TEXT,
  noc_addressee TEXT,
  noc_bank_address TEXT,
  noc_bank_address_line1 TEXT,
  noc_bank_address_line2 TEXT,
  noc_bank_city TEXT,
  noc_bank_state TEXT,
  noc_bank_pin_code TEXT,
  noc_bank_country TEXT,
  status booking_status NOT NULL DEFAULT 'DRAFT',
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES profiles(id)
);

CREATE INDEX idx_bookings_serial ON bookings(serial_no);
CREATE INDEX idx_bookings_applicant_name ON bookings(applicant_name);
CREATE INDEX idx_bookings_applicant_mobile ON bookings(applicant_mobile);
CREATE INDEX idx_bookings_project_name ON bookings(project_name);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_created_by ON bookings(created_by);
CREATE INDEX idx_bookings_created_at ON bookings(created_at DESC);
CREATE INDEX idx_bookings_submitted_at ON bookings(submitted_at DESC);
CREATE INDEX idx_bookings_deleted_at ON bookings(deleted_at);

-- Prevent double-booking: one active hold per project+unit (DRAFT excluded).
CREATE UNIQUE INDEX idx_bookings_active_unit_unique
  ON bookings (project_name, unit_no)
  WHERE status IN ('PENDING', 'SUBMITTED', 'EDITED')
    AND deleted_at IS NULL
    AND project_name IS NOT NULL
    AND unit_no IS NOT NULL;

-- -----------------------------------------------------------------------------
-- KYC DOCUMENTS
-- -----------------------------------------------------------------------------

CREATE TABLE booking_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (
    document_type IN ('applicant_pan', 'applicant_aadhaar', 'coapplicant_pan', 'coapplicant_aadhaar')
  ),
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  uploaded_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_booking_documents_booking_id ON booking_documents(booking_id);

-- Co-applicants, each with their own address. Documents point at coapplicant_id.
CREATE TABLE booking_coapplicants (
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

CREATE INDEX idx_booking_coapplicants_booking ON booking_coapplicants(booking_id, sort_order);

ALTER TABLE booking_documents
  ADD COLUMN IF NOT EXISTS coapplicant_id UUID REFERENCES booking_coapplicants(id) ON DELETE CASCADE;

-- Priced parking spaces. additional_parking = main count, premium_parking = secondary count.
CREATE TABLE booking_parking_spaces (
  id UUID PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL CHECK (kind IN ('main', 'secondary')),
  quantity INTEGER NOT NULL DEFAULT 1,
  label TEXT,
  price NUMERIC(14, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_booking_parking_spaces_booking ON booking_parking_spaces(booking_id, sort_order);

-- Saved payment schedule. Percentages apply to the flat base price, not parking.
CREATE TABLE booking_schedule_rows (
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

CREATE INDEX idx_booking_schedule_rows_booking ON booking_schedule_rows(booking_id, sort_order);

-- -----------------------------------------------------------------------------
-- PAYMENT SLABS (reference)
-- -----------------------------------------------------------------------------

CREATE TABLE payment_slabs (
  id SMALLINT PRIMARY KEY,
  sr_no SMALLINT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  percentage NUMERIC(5, 2) NOT NULL
);

INSERT INTO payment_slabs (id, sr_no, label, percentage) VALUES
(1, 1, '20% at the time of execution of the Agreement', 20),
(2, 2, '10% before casting of Basement slab', 10),
(3, 3, '10% before casting of Ground slab', 10),
(4, 4, '6% before casting of 1st floor slab', 6),
(5, 5, '6% before casting of 2nd floor slab', 6),
(6, 6, '6% before casting of 3rd floor slab', 6),
(7, 7, '6% before casting of 4th floor slab', 6),
(8, 8, '6% before casting of 5th floor slab', 6),
(9, 9, '5% before casting of 6th floor slab', 5),
(10, 10, '5% before casting of 7th floor slab', 5),
(11, 11, '5% before casting of 8th floor slab', 5),
(12, 12, '5% before casting of 9th floor slab', 5),
(13, 13, '5% before casting of 10th floor slab', 5),
(14, 14, '5% at the time of Handover/ Registry of flat', 5);

CREATE TABLE booking_payment_slabs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  slab_id SMALLINT NOT NULL REFERENCES payment_slabs(id),
  amount_due NUMERIC(12, 2) NOT NULL,
  amount_received NUMERIC(12, 2) DEFAULT 0,
  received_at DATE,
  entered_by UUID REFERENCES profiles(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (booking_id, slab_id)
);

CREATE INDEX idx_booking_payment_slabs_booking ON booking_payment_slabs(booking_id);
CREATE INDEX idx_booking_payment_slabs_slab ON booking_payment_slabs(slab_id);

-- -----------------------------------------------------------------------------
-- AUDIT LOGS
-- -----------------------------------------------------------------------------

-- RESTRICT (not CASCADE): hard-deleting a booking must never silently erase
-- its audit history. Bookings with history are soft-deleted instead.
CREATE TABLE booking_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  changed_by UUID NOT NULL REFERENCES profiles(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  action TEXT NOT NULL,
  diff_json JSONB,
  reason TEXT
);

CREATE INDEX idx_audit_log_booking_id ON booking_audit_log(booking_id);
CREATE INDEX idx_audit_log_changed_at ON booking_audit_log(changed_at DESC);

CREATE TABLE admin_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id UUID REFERENCES profiles(id),
  action TEXT NOT NULL,
  target_user_id UUID REFERENCES profiles(id),
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_admin_audit_log_created_at ON admin_audit_log(created_at DESC);

-- -----------------------------------------------------------------------------
-- FUNCTIONS & TRIGGERS
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_bookings_updated_at BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_booking_payment_slabs_updated_at BEFORE UPDATE ON booking_payment_slabs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Assigns LUBC 01, LUBC 02, ... when a booking first becomes SUBMITTED.
--
-- Concurrency: MAX(serial_no) + 1 alone lets two concurrent approvals read the
-- same MAX and collide. The transaction-scoped advisory lock serializes only
-- serial assignment; it is released at COMMIT/ROLLBACK. Under READ COMMITTED
-- (Supabase default) the MAX query runs after the lock is acquired and sees
-- the previous holder's committed row. UNIQUE (serial_no) remains the backstop.
--
-- A SEQUENCE was not used because a rolled-back submit (e.g. the active-unit
-- unique index rejecting a double booking) would permanently burn a number and
-- leave gaps in customer-facing serials.
--
-- MAX scans every row that holds a serial (not just SUBMITTED/EDITED): a
-- booking reverted to DRAFT keeps its serial, and ignoring it would reissue a
-- number that UNIQUE (serial_no) then rejects. Soft delete clears serial_no.
--
-- SECURITY DEFINER so the MAX sees all rows regardless of the caller's RLS.
CREATE OR REPLACE FUNCTION generate_serial_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prefix TEXT;
  next_serial INTEGER;
BEGIN
  IF NEW.serial_no IS NULL AND NEW.status = 'SUBMITTED'
     AND (TG_OP = 'INSERT' OR OLD.status IN ('DRAFT', 'PENDING')) THEN
    PERFORM pg_advisory_xact_lock(hashtext('bookings.serial_no'));

    SELECT serial_prefix INTO prefix FROM settings LIMIT 1;
    SELECT COALESCE(MAX(serial_no), 0) + 1 INTO next_serial FROM bookings;

    NEW.serial_no := next_serial;
    -- Pad to at least 2 digits; plain LPAD(x, 2) would truncate 100 to '10'.
    NEW.serial_display := COALESCE(prefix, 'LUBC ')
      || LPAD(next_serial::TEXT, GREATEST(2, LENGTH(next_serial::TEXT)), '0');
    NEW.submitted_at := COALESCE(NEW.submitted_at, NOW());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER generate_booking_serial_insert BEFORE INSERT ON bookings
  FOR EACH ROW EXECUTE FUNCTION generate_serial_number();
CREATE TRIGGER generate_booking_serial_update BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION generate_serial_number();

-- -----------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- -----------------------------------------------------------------------------

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_slabs ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_payment_slabs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION is_active_staff()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND status = 'ACTIVE'
      AND role IN ('EXECUTIVE', 'ADMIN')
  );
$$;

CREATE OR REPLACE FUNCTION is_active_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND status = 'ACTIVE'
      AND role = 'ADMIN'
  );
$$;

-- -----------------------------------------------------------------------------
-- ROLE GUARD TRIGGERS
--
-- RLS policies can only see the new row in WITH CHECK, not the old one, so
-- rules about *transitions* (who may change status, ownership, serials or
-- deletion state) are enforced here. These matter because the browser holds
-- the anon key + user JWT and can call PostgREST directly, bypassing the
-- server actions. Admins and server-side service-role calls (auth.uid() IS
-- NULL) are not restricted by these triggers.
-- -----------------------------------------------------------------------------

-- Executives may: create DRAFT/PENDING, move own DRAFT <-> PENDING, and edit a
-- SUBMITTED/EDITED booking (which leaves it EDITED). Approval (PENDING ->
-- SUBMITTED), rejection/revert, deletion/restore and serial changes are admin-only.
CREATE OR REPLACE FUNCTION enforce_booking_write_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.uid() IS NULL OR is_active_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('DRAFT', 'PENDING') THEN
      RAISE EXCEPTION 'Only an admin can create a submitted booking'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.serial_no IS NOT NULL OR NEW.serial_display IS NOT NULL
       OR NEW.deleted_at IS NOT NULL OR NEW.deleted_by IS NOT NULL THEN
      RAISE EXCEPTION 'Serial numbers and deletion fields are set by the system'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.serial_no IS DISTINCT FROM OLD.serial_no
     OR NEW.serial_display IS DISTINCT FROM OLD.serial_display
     OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
     OR NEW.deleted_by IS DISTINCT FROM OLD.deleted_by THEN
    RAISE EXCEPTION 'Only an admin can change ownership, serial numbers or deletion state'
      USING ERRCODE = '42501';
  END IF;

  IF OLD.status IN ('DRAFT', 'PENDING') AND NEW.status NOT IN ('DRAFT', 'PENDING') THEN
    RAISE EXCEPTION 'Only an admin can approve a pending booking'
      USING ERRCODE = '42501';
  END IF;

  IF OLD.status IN ('SUBMITTED', 'EDITED') AND NEW.status <> 'EDITED' THEN
    RAISE EXCEPTION 'Only an admin can change the status of a submitted booking'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_booking_write_rules BEFORE INSERT OR UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION enforce_booking_write_rules();

-- 79 main (additional_parking) and 27 secondary (premium_parking).
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

CREATE TRIGGER enforce_parking_inventory
  BEFORE INSERT OR UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION enforce_parking_inventory();

-- profiles_update_own exists so the login page can stamp last_login. Without
-- this guard, any user could also promote themselves to ADMIN or re-activate
-- a DISABLED account.
CREATE OR REPLACE FUNCTION protect_profile_privileges()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.uid() IS NULL OR is_active_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'Only an admin can change role, status or email'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_profile_privileges BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION protect_profile_privileges();

-- -----------------------------------------------------------------------------
-- POLICIES
--
-- All policies are PERMISSIVE, so policies for the same command are OR-ed.
-- Never add a broad "staff can do X" policy next to a narrow one for the same
-- command: the broad one silently wins.
-- -----------------------------------------------------------------------------

-- Profiles
-- Staff can read colleagues' profiles: booking pages join creator names.
-- No INSERT policy for regular users: profiles are created by the admin
-- createUser action (service role). A self-insert policy would let anyone who
-- can sign up to Supabase Auth insert themselves as an ACTIVE ADMIN.
CREATE POLICY profiles_select_own ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY profiles_staff_select ON profiles FOR SELECT USING (is_active_staff());
CREATE POLICY profiles_update_own ON profiles FOR UPDATE
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY profiles_admin_all ON profiles FOR ALL
  USING (is_active_admin()) WITH CHECK (is_active_admin());

-- Settings (not for PENDING/DISABLED users)
CREATE POLICY settings_staff_select ON settings FOR SELECT USING (is_active_staff());
CREATE POLICY settings_admin_update ON settings FOR UPDATE
  USING (is_active_admin()) WITH CHECK (is_active_admin());

-- Bookings
-- Drafts are private to their creator; everything else is visible to staff.
CREATE POLICY bookings_staff_select ON bookings FOR SELECT
  USING (
    is_active_staff()
    AND deleted_at IS NULL
    AND (status <> 'DRAFT' OR created_by = auth.uid())
  );
CREATE POLICY bookings_admin_select ON bookings FOR SELECT USING (is_active_admin());

-- Allowed status values for non-admins are enforced by enforce_booking_write_rules.
CREATE POLICY bookings_staff_insert ON bookings FOR INSERT
  WITH CHECK (is_active_staff() AND created_by = auth.uid());

-- Executive-editable rows: own DRAFT/PENDING, or any SUBMITTED/EDITED.
-- Another user's PENDING booking is awaiting admin approval and is not editable.
CREATE POLICY bookings_staff_update ON bookings FOR UPDATE
  USING (
    is_active_staff()
    AND deleted_at IS NULL
    AND (
      (created_by = auth.uid() AND status IN ('DRAFT', 'PENDING'))
      OR status IN ('SUBMITTED', 'EDITED')
    )
  )
  WITH CHECK (is_active_staff() AND deleted_at IS NULL);
CREATE POLICY bookings_admin_update ON bookings FOR UPDATE
  USING (is_active_admin()) WITH CHECK (is_active_admin());

-- Hard delete only for discarding your own draft. Real bookings are
-- soft-deleted by admins (UPDATE deleted_at). Drafts with audit history
-- (e.g. rejected bookings) are protected by the RESTRICT foreign key.
CREATE POLICY bookings_delete_own_draft ON bookings FOR DELETE
  USING (is_active_staff() AND created_by = auth.uid() AND status = 'DRAFT');

-- Booking audit: append-only (no UPDATE/DELETE policies).
CREATE POLICY booking_audit_staff_select ON booking_audit_log FOR SELECT USING (is_active_staff());
CREATE POLICY booking_audit_staff_insert ON booking_audit_log FOR INSERT
  WITH CHECK (changed_by = auth.uid() AND is_active_staff());

-- Admin audit: append-only.
CREATE POLICY admin_audit_admin_select ON admin_audit_log FOR SELECT USING (is_active_admin());
CREATE POLICY admin_audit_admin_insert ON admin_audit_log FOR INSERT
  WITH CHECK (is_active_admin() AND admin_id = auth.uid());

-- Payment slabs: staff record payments; no one deletes payment rows via the API.
CREATE POLICY payment_slabs_staff_select ON payment_slabs FOR SELECT USING (is_active_staff());
CREATE POLICY booking_payment_slabs_staff_select ON booking_payment_slabs FOR SELECT
  USING (is_active_staff());
CREATE POLICY booking_payment_slabs_staff_insert ON booking_payment_slabs FOR INSERT
  WITH CHECK (is_active_staff());
CREATE POLICY booking_payment_slabs_staff_update ON booking_payment_slabs FOR UPDATE
  USING (is_active_staff()) WITH CHECK (is_active_staff());

-- KYC documents: uploader manages their own rows (upload, link to booking, delete).
CREATE POLICY booking_documents_staff_select ON booking_documents FOR SELECT USING (is_active_staff());
CREATE POLICY booking_documents_insert_own ON booking_documents FOR INSERT
  WITH CHECK (is_active_staff() AND uploaded_by = auth.uid());
CREATE POLICY booking_documents_update_own ON booking_documents FOR UPDATE
  USING (is_active_staff() AND uploaded_by = auth.uid())
  WITH CHECK (is_active_staff() AND uploaded_by = auth.uid());
CREATE POLICY booking_documents_delete_own ON booking_documents FOR DELETE
  USING (is_active_staff() AND uploaded_by = auth.uid());

ALTER TABLE booking_coapplicants ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_parking_spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_schedule_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY booking_coapplicants_staff_all ON booking_coapplicants
  FOR ALL USING (is_active_staff()) WITH CHECK (is_active_staff());
CREATE POLICY booking_parking_spaces_staff_all ON booking_parking_spaces
  FOR ALL USING (is_active_staff()) WITH CHECK (is_active_staff());
CREATE POLICY booking_schedule_rows_staff_all ON booking_schedule_rows
  FOR ALL USING (is_active_staff()) WITH CHECK (is_active_staff());

-- -----------------------------------------------------------------------------
-- STORAGE
-- -----------------------------------------------------------------------------

-- Booking PDFs are generated on demand and never stored; this bucket holds
-- KYC uploads only.
INSERT INTO storage.buckets (id, name, public) VALUES ('booking-documents', 'booking-documents', false)
  ON CONFLICT (id) DO NOTHING;

-- No UPDATE policies: the app never overwrites files (upsert: false).

-- KYC files live under '<uploader uuid>/...'; uploaders may only write and
-- remove inside their own folder.
CREATE POLICY storage_booking_docs_staff_read ON storage.objects FOR SELECT
  USING (bucket_id = 'booking-documents' AND public.is_active_staff());
CREATE POLICY storage_booking_docs_insert_own ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'booking-documents'
    AND public.is_active_staff()
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
CREATE POLICY storage_booking_docs_delete ON storage.objects FOR DELETE
  USING (
    bucket_id = 'booking-documents'
    AND (
      public.is_active_admin()
      OR (public.is_active_staff() AND (storage.foldername(name))[1] = auth.uid()::text)
    )
  );

-- -----------------------------------------------------------------------------
-- GRANTS
--
-- Tables created via the SQL Editor do not automatically receive Supabase's
-- default role grants. Without these, authenticated users get "permission
-- denied for table profiles" (42501) and the app cannot load their profile.
-- -----------------------------------------------------------------------------

GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;

GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO authenticated, service_role;


-- -----------------------------------------------------------------------------
-- DEMAND NOTES, MILESTONES, AND INSTALLMENT COLLECTIONS
-- Same statements as migrations/006_demand_notes.sql
-- -----------------------------------------------------------------------------

-- Demand notes, project milestones, and installment collections.
-- Safe to run more than once. Issued demand notes and receipt rows are not deleted.

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS demand_timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  ADD COLUMN IF NOT EXISTS demand_payment_days INTEGER NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS demand_number_template TEXT NOT NULL DEFAULT 'LUB/{PROJECT}/DN/{UNIT}/{SEQ}/{YEAR}',
  ADD COLUMN IF NOT EXISTS demand_gst_percent NUMERIC(5, 2) NOT NULL DEFAULT 5;

CREATE TABLE IF NOT EXISTS construction_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_name TEXT NOT NULL,
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  match_phrase TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  completed_at DATE,
  completed_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_name, code)
);

INSERT INTO construction_milestones (project_name, code, label, match_phrase, sort_order)
VALUES
  ('Anandam', 'AGREEMENT', 'At the time of execution of the Agreement', 'execution of the Agreement', 1),
  ('Anandam', 'BASEMENT', 'Before casting of Basement slab', 'Basement slab', 2),
  ('Anandam', 'GROUND', 'Before casting of Ground slab', 'Ground slab', 3),
  ('Anandam', 'FLOOR_1', 'Before casting of 1st floor slab', '1st floor slab', 4),
  ('Anandam', 'FLOOR_2', 'Before casting of 2nd floor slab', '2nd floor slab', 5),
  ('Anandam', 'FLOOR_3', 'Before casting of 3rd floor slab', '3rd floor slab', 6),
  ('Anandam', 'FLOOR_4', 'Before casting of 4th floor slab', '4th floor slab', 7),
  ('Anandam', 'FLOOR_5', 'Before casting of 5th floor slab', '5th floor slab', 8),
  ('Anandam', 'FLOOR_6', 'Before casting of 6th floor slab', '6th floor slab', 9),
  ('Anandam', 'FLOOR_7', 'Before casting of 7th floor slab', '7th floor slab', 10),
  ('Anandam', 'FLOOR_8', 'Before casting of 8th floor slab', '8th floor slab', 11),
  ('Anandam', 'FLOOR_9', 'Before casting of 9th floor slab', '9th floor slab', 12),
  ('Anandam', 'FLOOR_10', 'Before casting of 10th floor slab', '10th floor slab', 13),
  ('Anandam', 'HANDOVER', 'At the time of Handover/ Registry of flat', 'Handover/ Registry', 14)
ON CONFLICT (project_name, code) DO NOTHING;

ALTER TABLE booking_schedule_rows
  ADD COLUMN IF NOT EXISTS milestone_id UUID REFERENCES construction_milestones(id);

UPDATE booking_schedule_rows AS row
SET milestone_id = milestone.id
FROM construction_milestones AS milestone
JOIN bookings AS booking ON booking.project_name = milestone.project_name
WHERE row.booking_id = booking.id
  AND row.milestone_id IS NULL
  AND row.trigger_type = 'milestone'
  AND row.label ILIKE '%' || milestone.match_phrase || '%';

CREATE TABLE IF NOT EXISTS payment_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  source TEXT NOT NULL CHECK (source IN ('booking_advance', 'demand_payment', 'manual')),
  principal_amount NUMERIC(14, 2) NOT NULL CHECK (principal_amount >= 0),
  gst_amount NUMERIC(14, 2) NOT NULL CHECK (gst_amount >= 0),
  payment_date DATE NOT NULL,
  payment_mode TEXT CHECK (payment_mode IS NULL OR payment_mode IN ('Cash', 'Cheque', 'NEFT_RTGS', 'UPI', 'Other')),
  reference_no TEXT,
  remarks TEXT,
  recorded_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (principal_amount > 0 OR gst_amount > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS payment_receipts_one_booking_advance
  ON payment_receipts (booking_id)
  WHERE source = 'booking_advance';

CREATE TABLE IF NOT EXISTS installment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id UUID NOT NULL REFERENCES payment_receipts(id) ON DELETE RESTRICT,
  schedule_row_id UUID NOT NULL REFERENCES booking_schedule_rows(id) ON DELETE RESTRICT,
  principal_amount NUMERIC(14, 2) NOT NULL CHECK (principal_amount >= 0),
  gst_amount NUMERIC(14, 2) NOT NULL CHECK (gst_amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id),
  CHECK (principal_amount > 0 OR gst_amount > 0)
);

CREATE INDEX IF NOT EXISTS idx_installment_allocations_row ON installment_allocations (schedule_row_id);
CREATE INDEX IF NOT EXISTS idx_installment_allocations_receipt ON installment_allocations (receipt_id);

CREATE TABLE IF NOT EXISTS demand_note_counters (
  scope_key TEXT PRIMARY KEY,
  last_seq INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS demand_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  schedule_row_id UUID NOT NULL REFERENCES booking_schedule_rows(id) ON DELETE RESTRICT,
  reference_number TEXT NOT NULL UNIQUE,
  sequence_no INTEGER NOT NULL,
  issue_date DATE NOT NULL,
  payment_deadline DATE NOT NULL,
  project_name TEXT NOT NULL,
  unit_no TEXT NOT NULL,
  applicant_name TEXT,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('DEVELOPER', 'LANDOWNER')),
  trigger_label TEXT NOT NULL,
  milestone_id UUID REFERENCES construction_milestones(id),
  installment_amount NUMERIC(14, 2) NOT NULL,
  gst_amount NUMERIC(14, 2) NOT NULL,
  principal_received_at_issue NUMERIC(14, 2) NOT NULL,
  gst_received_at_issue NUMERIC(14, 2) NOT NULL,
  snapshot JSONB NOT NULL,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (schedule_row_id)
);

CREATE INDEX IF NOT EXISTS idx_demand_notes_booking ON demand_notes (booking_id);
CREATE INDEX IF NOT EXISTS idx_demand_notes_issue_date ON demand_notes (issue_date);

-- A consumed sequence number is never returned, including when the insert loses a race.
CREATE OR REPLACE FUNCTION next_demand_sequence(scope_key TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  seq INTEGER;
  chosen_scope TEXT;
BEGIN
  chosen_scope := scope_key;
  INSERT INTO demand_note_counters (scope_key, last_seq)
  VALUES (chosen_scope, 1)
  ON CONFLICT (scope_key) DO UPDATE
    SET last_seq = demand_note_counters.last_seq + 1
  RETURNING last_seq INTO seq;
  RETURN seq;
END;
$$;

REVOKE ALL ON FUNCTION next_demand_sequence(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION next_demand_sequence(TEXT) TO authenticated, service_role;

-- Caps are checked inside the insert transaction, after waiting for any other
-- allocation of the same installment or receipt.
CREATE OR REPLACE FUNCTION enforce_installment_allocation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  inst NUMERIC(14, 2);
  gst_percent NUMERIC(5, 2);
  gst_cap NUMERIC(14, 2);
  used_principal NUMERIC(14, 2);
  used_gst NUMERIC(14, 2);
  receipt_principal NUMERIC(14, 2);
  receipt_gst NUMERIC(14, 2);
  allocated_principal NUMERIC(14, 2);
  allocated_gst NUMERIC(14, 2);
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('schedule:' || NEW.schedule_row_id::text)::bigint);
  PERFORM pg_advisory_xact_lock(hashtext('receipt:' || NEW.receipt_id::text)::bigint);

  SELECT calculated_amount INTO inst
  FROM booking_schedule_rows
  WHERE id = NEW.schedule_row_id;
  IF inst IS NULL THEN
    RAISE EXCEPTION 'Installment not found' USING ERRCODE = '23503';
  END IF;

  SELECT COALESCE(demand_gst_percent, 5) INTO gst_percent FROM settings LIMIT 1;
  gst_cap := round(inst * gst_percent / 100.0, 2);

  SELECT COALESCE(SUM(principal_amount), 0), COALESCE(SUM(gst_amount), 0)
    INTO used_principal, used_gst
  FROM installment_allocations
  WHERE schedule_row_id = NEW.schedule_row_id;

  IF used_principal + NEW.principal_amount > inst THEN
    RAISE EXCEPTION 'Principal is larger than the outstanding installment' USING ERRCODE = '23514';
  END IF;
  IF used_gst + NEW.gst_amount > gst_cap THEN
    RAISE EXCEPTION 'GST is larger than the outstanding GST' USING ERRCODE = '23514';
  END IF;

  SELECT principal_amount, gst_amount INTO receipt_principal, receipt_gst
  FROM payment_receipts
  WHERE id = NEW.receipt_id;

  SELECT COALESCE(SUM(principal_amount), 0), COALESCE(SUM(gst_amount), 0)
    INTO allocated_principal, allocated_gst
  FROM installment_allocations
  WHERE receipt_id = NEW.receipt_id;

  IF allocated_principal + NEW.principal_amount > receipt_principal
     OR allocated_gst + NEW.gst_amount > receipt_gst THEN
    RAISE EXCEPTION 'Allocation exceeds the receipt' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_installment_allocation ON installment_allocations;
CREATE TRIGGER enforce_installment_allocation
  BEFORE INSERT ON installment_allocations
  FOR EACH ROW EXECUTE FUNCTION enforce_installment_allocation();

-- Receipt and allocation commit together. A failed cap check leaves no receipt.
CREATE OR REPLACE FUNCTION create_receipt_and_allocate(
  p_booking_id UUID,
  p_schedule_row_id UUID,
  p_principal NUMERIC,
  p_gst NUMERIC,
  p_payment_date DATE,
  p_payment_mode TEXT,
  p_reference TEXT,
  p_remarks TEXT,
  p_user UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_receipt UUID;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT is_active_staff() THEN
    RAISE EXCEPTION 'Staff access required' USING ERRCODE = '42501';
  END IF;
  IF p_principal < 0 OR p_gst < 0 OR (p_principal = 0 AND p_gst = 0) THEN
    RAISE EXCEPTION 'Enter a principal amount or a GST amount' USING ERRCODE = '23514';
  END IF;
  IF p_payment_mode NOT IN ('Cash', 'Cheque', 'NEFT_RTGS', 'UPI', 'Other') THEN
    RAISE EXCEPTION 'Choose a payment mode' USING ERRCODE = '23514';
  END IF;

  INSERT INTO payment_receipts (
    booking_id, source, principal_amount, gst_amount, payment_date, payment_mode, reference_no, remarks, recorded_by
  ) VALUES (
    p_booking_id, 'demand_payment', p_principal, p_gst, p_payment_date, p_payment_mode,
    NULLIF(btrim(COALESCE(p_reference, '')), ''), NULLIF(btrim(COALESCE(p_remarks, '')), ''), p_user
  ) RETURNING id INTO new_receipt;

  INSERT INTO installment_allocations (receipt_id, schedule_row_id, principal_amount, gst_amount, created_by)
  VALUES (new_receipt, p_schedule_row_id, p_principal, p_gst, p_user);

  RETURN new_receipt;
END;
$$;

REVOKE ALL ON FUNCTION create_receipt_and_allocate(UUID, UUID, NUMERIC, NUMERIC, DATE, TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_receipt_and_allocate(UUID, UUID, NUMERIC, NUMERIC, DATE, TEXT, TEXT, TEXT, UUID) TO authenticated, service_role;

ALTER TABLE construction_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE installment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE demand_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE demand_note_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS construction_milestones_staff_select ON construction_milestones;
CREATE POLICY construction_milestones_staff_select ON construction_milestones
  FOR SELECT USING (is_active_staff());

DROP POLICY IF EXISTS construction_milestones_admin_update ON construction_milestones;
CREATE POLICY construction_milestones_admin_update ON construction_milestones
  FOR UPDATE USING (is_active_admin()) WITH CHECK (is_active_admin());

DROP POLICY IF EXISTS payment_receipts_staff_select ON payment_receipts;
CREATE POLICY payment_receipts_staff_select ON payment_receipts
  FOR SELECT USING (is_active_staff());

DROP POLICY IF EXISTS payment_receipts_staff_insert ON payment_receipts;
CREATE POLICY payment_receipts_staff_insert ON payment_receipts
  FOR INSERT WITH CHECK (is_active_staff());

DROP POLICY IF EXISTS installment_allocations_staff_select ON installment_allocations;
CREATE POLICY installment_allocations_staff_select ON installment_allocations
  FOR SELECT USING (is_active_staff());

DROP POLICY IF EXISTS installment_allocations_staff_insert ON installment_allocations;
CREATE POLICY installment_allocations_staff_insert ON installment_allocations
  FOR INSERT WITH CHECK (is_active_staff());

DROP POLICY IF EXISTS demand_notes_staff_select ON demand_notes;
CREATE POLICY demand_notes_staff_select ON demand_notes
  FOR SELECT USING (is_active_staff());

DROP POLICY IF EXISTS demand_notes_staff_insert ON demand_notes;
CREATE POLICY demand_notes_staff_insert ON demand_notes
  FOR INSERT WITH CHECK (is_active_staff());

GRANT SELECT, UPDATE ON construction_milestones TO authenticated, service_role;
GRANT SELECT, INSERT ON payment_receipts TO authenticated, service_role;
GRANT SELECT, INSERT ON installment_allocations TO authenticated, service_role;
GRANT SELECT, INSERT ON demand_notes TO authenticated, service_role;
GRANT ALL ON construction_milestones TO postgres, service_role;
GRANT ALL ON payment_receipts TO postgres, service_role;
GRANT ALL ON installment_allocations TO postgres, service_role;
GRANT ALL ON demand_notes TO postgres, service_role;
GRANT ALL ON demand_note_counters TO postgres, service_role;

REVOKE UPDATE, DELETE ON payment_receipts FROM authenticated;
REVOKE UPDATE, DELETE ON installment_allocations FROM authenticated;
REVOKE UPDATE, DELETE ON demand_notes FROM authenticated;
REVOKE ALL ON demand_note_counters FROM authenticated;


-- Agreement finance and frozen documents. See migrations/009_agreement_finance.sql.
-- Agreement parties, financing, multiple booking payments, and frozen generated files.
-- Safe to run once. Does not change existing booking rows or issued demand notes.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS applicant_relationship TEXT,
  ADD COLUMN IF NOT EXISTS applicant_occupation TEXT,
  ADD COLUMN IF NOT EXISTS undivided_land_share NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS finance_scenario TEXT,
  ADD COLUMN IF NOT EXISTS finance_bank_name TEXT,
  ADD COLUMN IF NOT EXISTS finance_bank_branch TEXT,
  ADD COLUMN IF NOT EXISTS finance_loan_status TEXT,
  ADD COLUMN IF NOT EXISTS finance_sanction_ref TEXT,
  ADD COLUMN IF NOT EXISTS finance_sanction_amount NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS finance_sanction_date DATE,
  ADD COLUMN IF NOT EXISTS finance_purchaser_percent NUMERIC,
  ADD COLUMN IF NOT EXISTS finance_bank_percent NUMERIC,
  ADD COLUMN IF NOT EXISTS finance_split_scope TEXT;

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_finance_scenario_check;
ALTER TABLE bookings
  ADD CONSTRAINT bookings_finance_scenario_check
  CHECK (finance_scenario IS NULL OR finance_scenario IN ('purchaser', 'split_50_50', 'split_10_90', 'split'));

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_finance_split_scope_check;
ALTER TABLE bookings
  ADD CONSTRAINT bookings_finance_split_scope_check
  CHECK (finance_split_scope IS NULL OR finance_split_scope IN ('booking', 'every'));

ALTER TABLE booking_coapplicants
  ADD COLUMN IF NOT EXISTS relationship TEXT,
  ADD COLUMN IF NOT EXISTS occupation TEXT;

CREATE TABLE IF NOT EXISTS booking_payment_entries (
  id UUID PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  payer_kind TEXT NOT NULL CHECK (payer_kind IN ('applicant', 'coapplicant', 'bank', 'other')),
  payer_coapplicant_id UUID,
  payer_name TEXT,
  amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  payment_mode TEXT,
  payment_mode_detail TEXT,
  reference_no TEXT,
  payment_date DATE,
  originating_bank TEXT,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'expected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_payment_entries_booking
  ON booking_payment_entries(booking_id, sort_order);

CREATE TABLE IF NOT EXISTS booking_generated_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('agreement')),
  version INTEGER NOT NULL,
  finalized BOOLEAN NOT NULL DEFAULT TRUE,
  snapshot JSONB NOT NULL,
  docx_base64 TEXT,
  pdf_base64 TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (booking_id, kind, version)
);

CREATE INDEX IF NOT EXISTS idx_booking_generated_documents_booking
  ON booking_generated_documents(booking_id, kind, version);

ALTER TABLE booking_payment_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_generated_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS booking_payment_entries_staff_all ON booking_payment_entries;
CREATE POLICY booking_payment_entries_staff_all ON booking_payment_entries
  FOR ALL USING (is_active_staff()) WITH CHECK (is_active_staff());

DROP POLICY IF EXISTS booking_generated_documents_staff_select ON booking_generated_documents;
CREATE POLICY booking_generated_documents_staff_select ON booking_generated_documents
  FOR SELECT USING (is_active_staff());

DROP POLICY IF EXISTS booking_generated_documents_staff_insert ON booking_generated_documents;
CREATE POLICY booking_generated_documents_staff_insert ON booking_generated_documents
  FOR INSERT WITH CHECK (is_active_staff());

GRANT SELECT, INSERT, UPDATE, DELETE ON booking_payment_entries TO authenticated, service_role;
GRANT SELECT, INSERT ON booking_generated_documents TO authenticated, service_role;
GRANT ALL ON booking_payment_entries TO postgres, service_role;
GRANT ALL ON booking_generated_documents TO postgres, service_role;
REVOKE UPDATE, DELETE ON booking_generated_documents FROM authenticated;
