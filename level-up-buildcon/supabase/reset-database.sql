-- =============================================
-- Level Up Buildcon - FULL DATABASE RESET
-- Run this in Supabase SQL Editor to drop all
-- app objects and start fresh. Then run schema.sql
-- =============================================

-- Drop tables (order matters for FKs)
DROP TABLE IF EXISTS booking_payment_slabs CASCADE;
DROP TABLE IF EXISTS payment_slabs CASCADE;
DROP TABLE IF EXISTS booking_audit_log CASCADE;
DROP TABLE IF EXISTS admin_audit_log CASCADE;
DROP TABLE IF EXISTS booking_files CASCADE;
DROP TABLE IF EXISTS bookings CASCADE;
DROP TABLE IF EXISTS settings CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- Drop sequences
DROP SEQUENCE IF EXISTS booking_serial_seq CASCADE;

-- Drop types
DROP TYPE IF EXISTS user_role CASCADE;
DROP TYPE IF EXISTS user_status CASCADE;
DROP TYPE IF EXISTS booking_status CASCADE;
DROP TYPE IF EXISTS unit_category CASCADE;
DROP TYPE IF EXISTS unit_type CASCADE;
DROP TYPE IF EXISTS payment_mode CASCADE;
DROP TYPE IF EXISTS payment_plan_type CASCADE;

-- Drop functions
DROP FUNCTION IF EXISTS update_updated_at_column CASCADE;
DROP FUNCTION IF EXISTS generate_serial_number CASCADE;

-- Storage: remove policies (bucket may remain)
-- Run manually if needed: DROP POLICY ... ON storage.objects;

-- Then run the full schema: supabase/schema.sql
