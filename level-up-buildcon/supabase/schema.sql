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
CREATE TYPE payment_mode AS ENUM ('Cash', 'Cheque', 'NEFT_RTGS', 'UPI');
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
  payment_plan_type payment_plan_type,
  payment_plan_custom_text TEXT,
  additional_parking INTEGER NOT NULL DEFAULT 0,
  premium_parking INTEGER NOT NULL DEFAULT 0,
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
