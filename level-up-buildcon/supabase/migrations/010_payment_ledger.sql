-- Transaction-level payment ledger: payer, clearance status, expected bank money,
-- atomic receipt + allocation, and audited corrections.
-- Additive. Existing receipts become 'cleared' (they were already treated as received).
-- Safe to run more than once.

-- The expected bank disbursement stays in booking_payment_entries with status 'expected'.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS finance_bank_address TEXT;

ALTER TABLE booking_payment_entries
  ADD COLUMN IF NOT EXISTS gst_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE booking_payment_entries DROP CONSTRAINT IF EXISTS booking_payment_entries_status_check;
ALTER TABLE booking_payment_entries
  ADD CONSTRAINT booking_payment_entries_status_check
  CHECK (status IN ('received', 'cleared', 'pending_clearance', 'returned', 'expected'));

ALTER TABLE payment_receipts
  ADD COLUMN IF NOT EXISTS payer_kind TEXT,
  ADD COLUMN IF NOT EXISTS payer_name TEXT,
  ADD COLUMN IF NOT EXISTS bank_name TEXT,
  ADD COLUMN IF NOT EXISTS clearance_status TEXT NOT NULL DEFAULT 'cleared',
  ADD COLUMN IF NOT EXISTS cleared_on DATE,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  -- The booking-form payment this receipt came from, or the expected bank contribution it fulfils.
  -- Not a foreign key: booking payment rows are rewritten with the same ids when a booking is edited.
  ADD COLUMN IF NOT EXISTS payment_entry_id UUID,
  ADD COLUMN IF NOT EXISTS expected_entry_id UUID;

ALTER TABLE payment_receipts DROP CONSTRAINT IF EXISTS payment_receipts_clearance_status_check;
ALTER TABLE payment_receipts
  ADD CONSTRAINT payment_receipts_clearance_status_check
  CHECK (clearance_status IN ('cleared', 'pending_clearance', 'returned'));

ALTER TABLE payment_receipts DROP CONSTRAINT IF EXISTS payment_receipts_payer_kind_check;
ALTER TABLE payment_receipts
  ADD CONSTRAINT payment_receipts_payer_kind_check
  CHECK (payer_kind IS NULL OR payer_kind IN ('applicant', 'coapplicant', 'bank', 'other'));

-- One receipt per booking-form payment row.
CREATE UNIQUE INDEX IF NOT EXISTS payment_receipts_one_per_entry
  ON payment_receipts (payment_entry_id)
  WHERE payment_entry_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_receipts_booking ON payment_receipts (booking_id);

-- Only cleared money can be applied to an installment.
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
  receipt_status TEXT;
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

  SELECT principal_amount, gst_amount, clearance_status
    INTO receipt_principal, receipt_gst, receipt_status
  FROM payment_receipts
  WHERE id = NEW.receipt_id;

  IF receipt_status IS DISTINCT FROM 'cleared' THEN
    RAISE EXCEPTION 'Only cleared money can be applied to an installment' USING ERRCODE = '23514';
  END IF;

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

-- Receipt plus any number of allocations in one transaction.
-- p_allocations: [{"schedule_row_id": "...", "principal": "100.00", "gst": "5.00"}]
CREATE OR REPLACE FUNCTION record_booking_payment(
  p_booking_id UUID,
  p_principal NUMERIC,
  p_gst NUMERIC,
  p_payment_date DATE,
  p_payment_mode TEXT,
  p_reference TEXT,
  p_payer_kind TEXT,
  p_payer_name TEXT,
  p_bank_name TEXT,
  p_clearance_status TEXT,
  p_notes TEXT,
  p_expected_entry_id UUID,
  p_payment_entry_id UUID,
  p_allocations JSONB,
  p_user UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_receipt UUID;
  item JSONB;
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
  IF p_clearance_status <> 'cleared' AND jsonb_array_length(COALESCE(p_allocations, '[]'::jsonb)) > 0 THEN
    RAISE EXCEPTION 'A payment awaiting clearance cannot be applied to an installment yet' USING ERRCODE = '23514';
  END IF;

  INSERT INTO payment_receipts (
    booking_id, source, principal_amount, gst_amount, payment_date, payment_mode, reference_no,
    remarks, recorded_by, payer_kind, payer_name, bank_name, clearance_status, cleared_on, notes,
    expected_entry_id, payment_entry_id
  ) VALUES (
    p_booking_id,
    CASE WHEN p_payment_entry_id IS NULL THEN 'manual' ELSE 'booking_advance_entry' END,
    p_principal, p_gst, p_payment_date, p_payment_mode,
    NULLIF(btrim(COALESCE(p_reference, '')), ''), NULL, p_user,
    p_payer_kind, NULLIF(btrim(COALESCE(p_payer_name, '')), ''), NULLIF(btrim(COALESCE(p_bank_name, '')), ''),
    p_clearance_status, CASE WHEN p_clearance_status = 'cleared' THEN p_payment_date END,
    NULLIF(btrim(COALESCE(p_notes, '')), ''), p_expected_entry_id, p_payment_entry_id
  ) RETURNING id INTO new_receipt;

  FOR item IN SELECT * FROM jsonb_array_elements(COALESCE(p_allocations, '[]'::jsonb)) LOOP
    INSERT INTO installment_allocations (receipt_id, schedule_row_id, principal_amount, gst_amount, created_by)
    VALUES (
      new_receipt,
      (item->>'schedule_row_id')::uuid,
      COALESCE((item->>'principal')::numeric, 0),
      COALESCE((item->>'gst')::numeric, 0),
      p_user
    );
  END LOOP;

  RETURN new_receipt;
END;
$$;

-- Clear or return a cheque. Clearing may apply it to installments in the same transaction.
CREATE OR REPLACE FUNCTION set_receipt_clearance(
  p_receipt_id UUID,
  p_status TEXT,
  p_cleared_on DATE,
  p_allocations JSONB,
  p_user UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_status TEXT;
  item JSONB;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT is_active_staff() THEN
    RAISE EXCEPTION 'Staff access required' USING ERRCODE = '42501';
  END IF;
  SELECT clearance_status INTO current_status FROM payment_receipts WHERE id = p_receipt_id FOR UPDATE;
  IF current_status IS NULL THEN
    RAISE EXCEPTION 'Receipt not found' USING ERRCODE = '23503';
  END IF;
  IF current_status <> 'pending_clearance' THEN
    RAISE EXCEPTION 'Only a payment awaiting clearance can be cleared or returned' USING ERRCODE = '23514';
  END IF;
  IF p_status NOT IN ('cleared', 'returned') THEN
    RAISE EXCEPTION 'Choose cleared or returned' USING ERRCODE = '23514';
  END IF;

  UPDATE payment_receipts
  SET clearance_status = p_status,
      cleared_on = CASE WHEN p_status = 'cleared' THEN COALESCE(p_cleared_on, CURRENT_DATE) END
  WHERE id = p_receipt_id;

  IF p_status = 'cleared' THEN
    FOR item IN SELECT * FROM jsonb_array_elements(COALESCE(p_allocations, '[]'::jsonb)) LOOP
      INSERT INTO installment_allocations (receipt_id, schedule_row_id, principal_amount, gst_amount, created_by)
      VALUES (
        p_receipt_id,
        (item->>'schedule_row_id')::uuid,
        COALESCE((item->>'principal')::numeric, 0),
        COALESCE((item->>'gst')::numeric, 0),
        p_user
      );
    END LOOP;
  END IF;
END;
$$;

-- Admin correction of a wrong allocation. The receipt itself is never deleted.
CREATE OR REPLACE FUNCTION reverse_installment_allocation(p_allocation_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT is_active_admin() THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;
  DELETE FROM installment_allocations WHERE id = p_allocation_id;
END;
$$;

ALTER TABLE payment_receipts DROP CONSTRAINT IF EXISTS payment_receipts_source_check;
ALTER TABLE payment_receipts
  ADD CONSTRAINT payment_receipts_source_check
  CHECK (source IN ('booking_advance', 'booking_advance_entry', 'demand_payment', 'manual'));

REVOKE ALL ON FUNCTION record_booking_payment(UUID, NUMERIC, NUMERIC, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, UUID, JSONB, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_booking_payment(UUID, NUMERIC, NUMERIC, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, UUID, JSONB, UUID) TO authenticated, service_role;
REVOKE ALL ON FUNCTION set_receipt_clearance(UUID, TEXT, DATE, JSONB, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_receipt_clearance(UUID, TEXT, DATE, JSONB, UUID) TO authenticated, service_role;
REVOKE ALL ON FUNCTION reverse_installment_allocation(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reverse_installment_allocation(UUID) TO authenticated, service_role;
