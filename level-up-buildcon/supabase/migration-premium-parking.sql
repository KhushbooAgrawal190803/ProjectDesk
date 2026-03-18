-- Adds premium parking support and ensures additional parking columns exist.
-- Run in Supabase SQL Editor for existing databases.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS additional_parking INTEGER NOT NULL DEFAULT 0;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS premium_parking INTEGER NOT NULL DEFAULT 0;

