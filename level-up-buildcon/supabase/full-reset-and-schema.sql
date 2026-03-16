-- =============================================
-- Level Up Buildcon - FULL RESET + SCHEMA
-- Paste this entire file into Supabase SQL Editor and Run.
-- This drops all app data/schema and recreates everything from scratch.
-- =============================================

-- ---------- PART 1: DROP EVERYTHING ----------

DROP TABLE IF EXISTS booking_payment_slabs CASCADE;
DROP TABLE IF EXISTS payment_slabs CASCADE;
DROP TABLE IF EXISTS booking_audit_log CASCADE;
DROP TABLE IF EXISTS admin_audit_log CASCADE;
DROP TABLE IF EXISTS booking_files CASCADE;
DROP TABLE IF EXISTS bookings CASCADE;
DROP TABLE IF EXISTS settings CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

DROP SEQUENCE IF EXISTS booking_serial_seq CASCADE;

DROP TYPE IF EXISTS user_role CASCADE;
DROP TYPE IF EXISTS user_status CASCADE;
DROP TYPE IF EXISTS booking_status CASCADE;
DROP TYPE IF EXISTS unit_category CASCADE;
DROP TYPE IF EXISTS unit_type CASCADE;
DROP TYPE IF EXISTS payment_mode CASCADE;
DROP TYPE IF EXISTS payment_plan_type CASCADE;

DROP FUNCTION IF EXISTS update_updated_at_column CASCADE;
DROP FUNCTION IF EXISTS generate_serial_number CASCADE;

-- ---------- PART 2: RECREATE SCHEMA ----------

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE user_role AS ENUM ('STAFF', 'EXECUTIVE', 'ACCOUNTS', 'ADMIN');
CREATE TYPE user_status AS ENUM ('PENDING', 'ACTIVE', 'DISABLED');
CREATE TYPE booking_status AS ENUM ('DRAFT', 'SUBMITTED', 'EDITED');
CREATE TYPE unit_category AS ENUM ('Residential', 'Commercial');
CREATE TYPE unit_type AS ENUM ('Flat', 'Villa', 'Plot', 'Shop', 'Office', 'Other');
CREATE TYPE payment_mode AS ENUM ('Cash', 'Cheque', 'NEFT_RTGS', 'UPI');
CREATE TYPE payment_plan_type AS ENUM ('ConstructionLinked', 'DownPayment', 'PossessionLinked', 'Custom');

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

CREATE INDEX idx_profiles_email ON profiles(email);
CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_profiles_status ON profiles(status);

CREATE TABLE settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  allow_self_signup BOOLEAN NOT NULL DEFAULT false,
  serial_prefix TEXT NOT NULL DEFAULT 'LUBC-',
  default_project_location TEXT NOT NULL DEFAULT 'Ranchi, Jharkhand',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO settings (allow_self_signup, serial_prefix, default_project_location)
VALUES (false, 'LUBC-', 'Ranchi, Jharkhand');

CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  serial_no INTEGER UNIQUE,
  serial_display TEXT,
  project_name TEXT NOT NULL,
  project_location TEXT NOT NULL DEFAULT 'Ranchi, Jharkhand',
  rera_regn_no TEXT,
  unit_category unit_category NOT NULL,
  unit_type unit_type NOT NULL,
  unit_type_other_text TEXT,
  unit_no TEXT NOT NULL,
  floor_no TEXT,
  builtup_area NUMERIC(10, 2),
  super_builtup_area NUMERIC(10, 2),
  carpet_area NUMERIC(10, 2),
  applicant_name TEXT NOT NULL,
  applicant_father_or_spouse TEXT NOT NULL,
  applicant_mobile TEXT NOT NULL,
  applicant_email TEXT,
  applicant_pan TEXT,
  applicant_aadhaar TEXT,
  applicant_address TEXT,
  coapplicant_name TEXT,
  coapplicant_relationship TEXT,
  coapplicant_mobile TEXT,
  coapplicant_pan TEXT,
  coapplicant_aadhaar TEXT,
  basic_sale_price NUMERIC(12, 2) NOT NULL,
  other_charges NUMERIC(12, 2) DEFAULT 0,
  total_cost NUMERIC(12, 2) NOT NULL,
  total_cost_override_reason TEXT,
  booking_amount_paid NUMERIC(12, 2) NOT NULL,
  payment_mode payment_mode NOT NULL,
  payment_mode_detail TEXT,
  txn_or_cheque_no TEXT,
  txn_date DATE,
  payment_plan_type payment_plan_type NOT NULL,
  payment_plan_custom_text TEXT,
  status booking_status NOT NULL DEFAULT 'DRAFT',
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  CONSTRAINT check_unit_type_other CHECK (
    (unit_type != 'Other' AND unit_type_other_text IS NULL) OR
    (unit_type = 'Other' AND unit_type_other_text IS NOT NULL)
  ),
  CONSTRAINT check_payment_plan_custom CHECK (
    (payment_plan_type != 'Custom' AND payment_plan_custom_text IS NULL) OR
    (payment_plan_type = 'Custom' AND payment_plan_custom_text IS NOT NULL)
  )
);

CREATE SEQUENCE booking_serial_seq START 1;

CREATE INDEX idx_bookings_serial ON bookings(serial_no);
CREATE INDEX idx_bookings_applicant_name ON bookings(applicant_name);
CREATE INDEX idx_bookings_applicant_mobile ON bookings(applicant_mobile);
CREATE INDEX idx_bookings_project_name ON bookings(project_name);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_created_by ON bookings(created_by);
CREATE INDEX idx_bookings_created_at ON bookings(created_at DESC);

CREATE TABLE booking_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  file_type TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_booking_files_booking_id ON booking_files(booking_id);

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
  UNIQUE(booking_id, slab_id)
);

CREATE INDEX idx_booking_payment_slabs_booking ON booking_payment_slabs(booking_id);
CREATE INDEX idx_booking_payment_slabs_slab ON booking_payment_slabs(slab_id);

CREATE TABLE booking_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  changed_by UUID NOT NULL REFERENCES profiles(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  action TEXT NOT NULL,
  diff_json JSONB,
  reason TEXT
);

CREATE INDEX idx_audit_log_booking_id ON booking_audit_log(booking_id);
CREATE INDEX idx_audit_log_changed_by ON booking_audit_log(changed_by);
CREATE INDEX idx_audit_log_changed_at ON booking_audit_log(changed_at DESC);

CREATE TABLE admin_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id UUID NOT NULL REFERENCES profiles(id),
  action TEXT NOT NULL,
  target_user_id UUID REFERENCES profiles(id),
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_admin_audit_log_admin_id ON admin_audit_log(admin_id);
CREATE INDEX idx_admin_audit_log_created_at ON admin_audit_log(created_at DESC);

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

CREATE OR REPLACE FUNCTION generate_serial_number()
RETURNS TRIGGER AS $$
DECLARE
  prefix TEXT;
BEGIN
  IF NEW.serial_no IS NULL AND NEW.status = 'SUBMITTED' THEN
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status = 'DRAFT') THEN
      SELECT serial_prefix INTO prefix FROM settings LIMIT 1;
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

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_slabs ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_payment_slabs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active users can view payment slabs"
  ON payment_slabs FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND status = 'ACTIVE'));

CREATE POLICY "Active users can view booking payment slabs"
  ON booking_payment_slabs FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND status = 'ACTIVE'));

CREATE POLICY "Accounts and admins can insert booking payment slabs"
  ON booking_payment_slabs FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ACCOUNTS', 'ADMIN') AND status = 'ACTIVE'));

CREATE POLICY "Accounts and admins can update booking payment slabs"
  ON booking_payment_slabs FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ACCOUNTS', 'ADMIN') AND status = 'ACTIVE'));

CREATE POLICY "Accounts and admins can delete booking payment slabs"
  ON booking_payment_slabs FOR DELETE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ACCOUNTS', 'ADMIN') AND status = 'ACTIVE'));

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'ADMIN' AND status = 'ACTIVE'));

CREATE POLICY "Admins can update profiles"
  ON profiles FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'ADMIN' AND status = 'ACTIVE'));

CREATE POLICY "Admins can create profiles"
  ON profiles FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'ADMIN' AND status = 'ACTIVE'));

CREATE POLICY "Authenticated users can view settings"
  ON settings FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can update settings"
  ON settings FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'ADMIN' AND status = 'ACTIVE'));

CREATE POLICY "Active users can view bookings"
  ON bookings FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND status = 'ACTIVE'));

CREATE POLICY "Active users can create bookings"
  ON bookings FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND status = 'ACTIVE') AND created_by = auth.uid());

CREATE POLICY "Staff can update own draft bookings"
  ON bookings FOR UPDATE
  USING (
    created_by = auth.uid() AND status = 'DRAFT' AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'STAFF' AND status = 'ACTIVE')
  );

CREATE POLICY "Executives and admins can update bookings"
  ON bookings FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('EXECUTIVE', 'ADMIN') AND status = 'ACTIVE'));

CREATE POLICY "Users can view booking files"
  ON booking_files FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM bookings
      JOIN profiles ON profiles.id = auth.uid() AND profiles.status = 'ACTIVE'
      WHERE bookings.id = booking_files.booking_id
    )
  );

CREATE POLICY "Service role can insert files"
  ON booking_files FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can view booking audit logs"
  ON booking_audit_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM bookings
      JOIN profiles ON profiles.id = auth.uid() AND profiles.status = 'ACTIVE'
      WHERE bookings.id = booking_audit_log.booking_id
    )
  );

CREATE POLICY "System can insert audit logs"
  ON booking_audit_log FOR INSERT WITH CHECK (changed_by = auth.uid());

CREATE POLICY "Admins can view admin audit logs"
  ON admin_audit_log FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'ADMIN' AND status = 'ACTIVE'));

CREATE POLICY "System can insert admin audit logs"
  ON admin_audit_log FOR INSERT WITH CHECK (admin_id = auth.uid());

INSERT INTO storage.buckets (id, name, public)
VALUES ('bookings', 'bookings', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated users can read booking files" ON storage.objects;
DROP POLICY IF EXISTS "Service role can upload booking files" ON storage.objects;
DROP POLICY IF EXISTS "Service role can delete booking files" ON storage.objects;

CREATE POLICY "Authenticated users can read booking files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'bookings' AND auth.uid() IS NOT NULL);

CREATE POLICY "Service role can upload booking files"
  ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'bookings');

CREATE POLICY "Service role can delete booking files"
  ON storage.objects FOR DELETE USING (bucket_id = 'bookings');

-- Done. All data is removed and schema is fresh.
-- Create your first user: Supabase Auth -> Add user -> then in SQL Editor run:
-- INSERT INTO profiles (id, full_name, email, role, status)
-- VALUES ('paste-auth-user-uuid-here', 'Your Name', 'your@email.com', 'ADMIN', 'ACTIVE');
