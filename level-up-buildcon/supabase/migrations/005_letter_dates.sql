-- Allotment date and Agreement for Sale date are independent.
-- The NOC uses the allotment date as its date and never copies it into the agreement date.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS allotment_date DATE,
  ADD COLUMN IF NOT EXISTS agreement_for_sale_date DATE;
