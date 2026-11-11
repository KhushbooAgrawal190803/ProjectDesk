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
  ADD COLUMN IF NOT EXISTS finance_sanction_date DATE;

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_finance_scenario_check;
ALTER TABLE bookings
  ADD CONSTRAINT bookings_finance_scenario_check
  CHECK (finance_scenario IS NULL OR finance_scenario IN ('purchaser', 'split_50_50', 'split_10_90'));

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
