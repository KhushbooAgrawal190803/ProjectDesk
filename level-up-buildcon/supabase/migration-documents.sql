-- =============================================
-- Migration: Document Uploads for PAN/Aadhaar
-- =============================================

-- 1. Create booking_documents table
CREATE TABLE IF NOT EXISTS booking_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN (
    'applicant_pan', 'applicant_aadhaar',
    'coapplicant_pan', 'coapplicant_aadhaar'
  )),
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  uploaded_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_booking_documents_booking_id ON booking_documents(booking_id);

-- 3. Enable RLS
ALTER TABLE booking_documents ENABLE ROW LEVEL SECURITY;

-- 4. RLS policies
CREATE POLICY "Users can view documents for their bookings"
  ON booking_documents FOR SELECT
  USING (
    uploaded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ADMIN', 'EXECUTIVE')
    )
  );

CREATE POLICY "Users can insert documents"
  ON booking_documents FOR INSERT
  WITH CHECK (uploaded_by = auth.uid());

CREATE POLICY "Users can delete their own documents"
  ON booking_documents FOR DELETE
  USING (uploaded_by = auth.uid());

-- 5. Create storage bucket for booking documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'booking-documents',
  'booking-documents',
  false,
  10485760,  -- 10MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- 6. Storage policies
CREATE POLICY "Authenticated users can upload booking documents"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'booking-documents');

CREATE POLICY "Users can view booking documents"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'booking-documents');

CREATE POLICY "Users can delete their booking documents"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'booking-documents');
