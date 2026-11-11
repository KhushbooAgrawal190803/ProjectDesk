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
  payment_mode TEXT CHECK (payment_mode IS NULL OR payment_mode IN ('Cash', 'Cheque', 'NEFT_RTGS', 'UPI')),
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
  IF p_payment_mode NOT IN ('Cash', 'Cheque', 'NEFT_RTGS', 'UPI') THEN
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
