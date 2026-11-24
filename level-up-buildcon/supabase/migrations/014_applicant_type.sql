-- The main applicant can be an individual, an HUF, a company, a partnership
-- firm, a trust / society, or another kind of body (stored as typed).
-- A non-individual applicant books through a representative who signs for it,
-- e.g. the Karta of an HUF or a company's authorised signatory.
--
-- Existing bookings become 'Individual'. Safe to re-run.

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS applicant_type TEXT NOT NULL DEFAULT 'Individual';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS applicant_representative TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS applicant_representative_designation TEXT;

-- PostgREST caches the table shape; ask it to reload so the app sees the new columns at once.
NOTIFY pgrst, 'reload schema';
