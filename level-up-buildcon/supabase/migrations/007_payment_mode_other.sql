-- Adds Others as a booking payment mode. UPI stays valid so existing rows still load.
-- The new enum value is not inserted in this script. Postgres cannot use a value
-- added in the same transaction.

ALTER TYPE payment_mode ADD VALUE IF NOT EXISTS 'Other';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'payment_receipts'
  ) THEN
    ALTER TABLE payment_receipts DROP CONSTRAINT IF EXISTS payment_receipts_payment_mode_check;
    ALTER TABLE payment_receipts
      ADD CONSTRAINT payment_receipts_payment_mode_check
      CHECK (payment_mode IS NULL OR payment_mode IN ('Cash', 'Cheque', 'NEFT_RTGS', 'UPI', 'Other'));
  END IF;
END $$;

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
