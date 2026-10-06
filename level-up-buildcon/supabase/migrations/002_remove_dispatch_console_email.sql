-- =============================================================================
-- ONE-TIME cleanup for a database already initialized with the V2 schema.sql.
-- Removes the dispatch workflow, System Console, payment-reminder and
-- forgot-password-notification objects, plus the unused legacy booking_files
-- table. Fresh installs do not need this: schema.sql no longer creates them.
--
-- BEFORE running: in Supabase Dashboard → Storage, delete the buckets
-- 'dispatch-documents' and 'bookings' (Supabase blocks direct SQL deletes on
-- storage tables; the Dashboard empties and removes them). Keep
-- 'booking-documents' — it holds KYC uploads.
--
-- This permanently deletes all dispatch records and console workbook data.
-- =============================================================================

BEGIN;

-- Storage policies for the removed dispatch bucket. These must go before the
-- table: storage_dispatch_delete references booking_dispatch_documents.
DROP POLICY IF EXISTS storage_dispatch_staff_read ON storage.objects;
DROP POLICY IF EXISTS storage_dispatch_staff_insert ON storage.objects;
DROP POLICY IF EXISTS storage_dispatch_delete ON storage.objects;

-- Dispatch documents (its RLS policies, indexes and updated_at trigger are
-- dropped with the table).
DROP TABLE IF EXISTS public.booking_dispatch_documents;
DROP TYPE IF EXISTS public.dispatch_status;
DROP TYPE IF EXISTS public.dispatch_copy_type;

-- System Console (encrypted shared workbook).
DROP TABLE IF EXISTS public.system_console_cells;
DROP TABLE IF EXISTS public.system_console_meta;

-- Legacy stored-PDF metadata; PDFs are generated on demand.
DROP TABLE IF EXISTS public.booking_files;

-- Payment reminder emails and forgot-password notification email.
ALTER TABLE public.booking_payment_slabs DROP COLUMN IF EXISTS last_reminder_sent_at;
ALTER TABLE public.settings DROP COLUMN IF EXISTS forgot_password_email;

COMMIT;

-- Verification: every row should report false.
SELECT 'booking_dispatch_documents' AS object, to_regclass('public.booking_dispatch_documents') IS NOT NULL AS still_exists
UNION ALL SELECT 'system_console_cells', to_regclass('public.system_console_cells') IS NOT NULL
UNION ALL SELECT 'system_console_meta', to_regclass('public.system_console_meta') IS NOT NULL
UNION ALL SELECT 'booking_files', to_regclass('public.booking_files') IS NOT NULL
UNION ALL SELECT 'dispatch_status type', to_regtype('public.dispatch_status') IS NOT NULL
UNION ALL SELECT 'dispatch_copy_type type', to_regtype('public.dispatch_copy_type') IS NOT NULL
UNION ALL SELECT 'storage_dispatch_* policies', EXISTS (
  SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND policyname LIKE 'storage_dispatch_%')
UNION ALL SELECT 'last_reminder_sent_at column', EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'booking_payment_slabs' AND column_name = 'last_reminder_sent_at')
UNION ALL SELECT 'forgot_password_email column', EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'settings' AND column_name = 'forgot_password_email')
UNION ALL SELECT 'dispatch-documents / bookings buckets', EXISTS (
  SELECT 1 FROM storage.buckets WHERE id IN ('dispatch-documents', 'bookings'));
