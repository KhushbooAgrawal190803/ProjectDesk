-- Temporary table to track deleted bookings until soft delete columns are added
CREATE TABLE IF NOT EXISTS deleted_bookings_temp (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL UNIQUE REFERENCES bookings(id),
  deleted_by UUID NOT NULL REFERENCES profiles(id),
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_deleted_bookings_booking_id ON deleted_bookings_temp(booking_id);
CREATE INDEX IF NOT EXISTS idx_deleted_bookings_deleted_at ON deleted_bookings_temp(deleted_at);
