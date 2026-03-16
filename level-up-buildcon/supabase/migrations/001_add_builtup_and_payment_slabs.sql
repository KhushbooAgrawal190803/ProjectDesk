-- Add builtup_area to bookings (for flat area schedule)
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS builtup_area NUMERIC(10, 2);

-- =============================================
-- PAYMENT SCHEDULE SLABS (Construction-linked)
-- =============================================

CREATE TABLE IF NOT EXISTS payment_slabs (
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
(14, 14, '5% at the time of Handover/ Registry of flat', 5)
ON CONFLICT (id) DO NOTHING;

-- =============================================
-- BOOKING PAYMENT SLABS
-- =============================================

CREATE TABLE IF NOT EXISTS booking_payment_slabs (
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

CREATE INDEX IF NOT EXISTS idx_booking_payment_slabs_booking ON booking_payment_slabs(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_payment_slabs_slab ON booking_payment_slabs(slab_id);

DROP TRIGGER IF EXISTS update_booking_payment_slabs_updated_at ON booking_payment_slabs;
CREATE TRIGGER update_booking_payment_slabs_updated_at BEFORE UPDATE ON booking_payment_slabs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
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
