-- =============================================
-- Level Up Buildcon - CLEAR ALL DATA
-- Removes all data from the site. Schema stays.
-- Run in Supabase SQL Editor.
-- =============================================

-- Delete in order (respect foreign keys)

DELETE FROM booking_payment_slabs;
DELETE FROM booking_audit_log;
DELETE FROM admin_audit_log;
DELETE FROM booking_files;
DELETE FROM bookings;

-- Reset serial number for new bookings
ALTER SEQUENCE IF EXISTS booking_serial_seq RESTART WITH 1;

-- Optional: remove all users (profiles). Uncomment the next line if you want no logins.
-- DELETE FROM profiles;

-- Optional: reset settings to defaults. Uncomment to reset.
-- DELETE FROM settings;
-- INSERT INTO settings (allow_self_signup, serial_prefix, default_project_location)
-- VALUES (false, 'LUBC-', 'Ranchi, Jharkhand');

-- Done. Bookings, files, audit logs, and payment slab entries are gone.
-- Profiles (and thus logins) are kept unless you uncommented DELETE FROM profiles.
