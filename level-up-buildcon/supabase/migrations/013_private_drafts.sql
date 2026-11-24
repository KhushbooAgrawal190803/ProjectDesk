-- Drafts are private to the person who started them.
--
-- The bookings table already hides another user's DRAFT (bookings_staff_select),
-- but the rows that hang off a booking (co-applicants, parking, schedule,
-- payment entries and KYC uploads) were readable by any staff member who knew
-- the booking id. Each policy below now also requires that the caller can see
-- the parent booking. The EXISTS subquery runs under the bookings policies, so
-- whatever hides a booking hides its details too. Admins see every booking and
-- so keep seeing everything; server-side service-role calls are unaffected.
--
-- Safe to re-run.

DROP POLICY IF EXISTS booking_coapplicants_staff_all ON booking_coapplicants;
CREATE POLICY booking_coapplicants_staff_all ON booking_coapplicants
  FOR ALL
  USING (is_active_staff() AND EXISTS (SELECT 1 FROM bookings b WHERE b.id = booking_coapplicants.booking_id))
  WITH CHECK (is_active_staff() AND EXISTS (SELECT 1 FROM bookings b WHERE b.id = booking_coapplicants.booking_id));

DROP POLICY IF EXISTS booking_parking_spaces_staff_all ON booking_parking_spaces;
CREATE POLICY booking_parking_spaces_staff_all ON booking_parking_spaces
  FOR ALL
  USING (is_active_staff() AND EXISTS (SELECT 1 FROM bookings b WHERE b.id = booking_parking_spaces.booking_id))
  WITH CHECK (is_active_staff() AND EXISTS (SELECT 1 FROM bookings b WHERE b.id = booking_parking_spaces.booking_id));

DROP POLICY IF EXISTS booking_schedule_rows_staff_all ON booking_schedule_rows;
CREATE POLICY booking_schedule_rows_staff_all ON booking_schedule_rows
  FOR ALL
  USING (is_active_staff() AND EXISTS (SELECT 1 FROM bookings b WHERE b.id = booking_schedule_rows.booking_id))
  WITH CHECK (is_active_staff() AND EXISTS (SELECT 1 FROM bookings b WHERE b.id = booking_schedule_rows.booking_id));

DROP POLICY IF EXISTS booking_payment_entries_staff_all ON booking_payment_entries;
CREATE POLICY booking_payment_entries_staff_all ON booking_payment_entries
  FOR ALL
  USING (is_active_staff() AND EXISTS (SELECT 1 FROM bookings b WHERE b.id = booking_payment_entries.booking_id))
  WITH CHECK (is_active_staff() AND EXISTS (SELECT 1 FROM bookings b WHERE b.id = booking_payment_entries.booking_id));

-- KYC records: your own uploads (including ones not yet attached to a booking),
-- or uploads on a booking you can see.
DROP POLICY IF EXISTS booking_documents_staff_select ON booking_documents;
CREATE POLICY booking_documents_staff_select ON booking_documents
  FOR SELECT
  USING (
    is_active_staff()
    AND (
      uploaded_by = auth.uid()
      OR (booking_id IS NOT NULL AND EXISTS (SELECT 1 FROM bookings b WHERE b.id = booking_documents.booking_id))
    )
  );

-- KYC files: admins, the uploader, or anyone who can see the booking the file belongs to.
DROP POLICY IF EXISTS storage_booking_docs_staff_read ON storage.objects;
CREATE POLICY storage_booking_docs_staff_read ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'booking-documents'
    AND public.is_active_staff()
    AND (
      public.is_active_admin()
      OR (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (SELECT 1 FROM public.booking_documents d WHERE d.file_path = storage.objects.name)
    )
  );
