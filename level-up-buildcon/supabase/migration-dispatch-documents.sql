-- =============================================
-- Dispatch Documents Migration
-- Accounts uploads sealed/signed copies, Admin approves,
-- then auto-send via email/WhatsApp
-- =============================================

-- Create dispatch status enum
CREATE TYPE dispatch_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SENT');

-- Create dispatch copy type enum  
CREATE TYPE dispatch_copy_type AS ENUM ('customer', 'company');

-- =============================================
-- BOOKING DISPATCH DOCUMENTS TABLE
-- =============================================

CREATE TABLE booking_dispatch_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  copy_type dispatch_copy_type NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,

  -- Dispatch targets (from booking)
  recipient_email TEXT,
  recipient_phone TEXT,

  -- Approval workflow
  status dispatch_status NOT NULL DEFAULT 'PENDING',
  uploaded_by UUID NOT NULL REFERENCES profiles(id),
  approved_by UUID REFERENCES profiles(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,

  -- Sending status
  email_sent_at TIMESTAMPTZ,
  whatsapp_sent_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_dispatch_docs_booking_id ON booking_dispatch_documents(booking_id);
CREATE INDEX idx_dispatch_docs_status ON booking_dispatch_documents(status);
CREATE INDEX idx_dispatch_docs_uploaded_by ON booking_dispatch_documents(uploaded_by);

-- Updated at trigger
CREATE TRIGGER update_dispatch_docs_updated_at
  BEFORE UPDATE ON booking_dispatch_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- RLS POLICIES
-- =============================================

ALTER TABLE booking_dispatch_documents ENABLE ROW LEVEL SECURITY;

-- ACCOUNTS and ADMIN can view all dispatch documents
CREATE POLICY "Accounts and Admin can view dispatch docs"
  ON booking_dispatch_documents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('ACCOUNTS', 'ADMIN')
      AND profiles.status = 'ACTIVE'
    )
  );

-- ACCOUNTS can insert dispatch documents
CREATE POLICY "Accounts can upload dispatch docs"
  ON booking_dispatch_documents FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('ACCOUNTS', 'ADMIN')
      AND profiles.status = 'ACTIVE'
    )
  );

-- ADMIN can update dispatch documents (approve/reject)
CREATE POLICY "Admin can update dispatch docs"
  ON booking_dispatch_documents FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'ADMIN'
      AND profiles.status = 'ACTIVE'
    )
  );

-- ADMIN can delete dispatch documents
CREATE POLICY "Admin can delete dispatch docs"
  ON booking_dispatch_documents FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'ADMIN'
      AND profiles.status = 'ACTIVE'
    )
  );

-- =============================================
-- STORAGE BUCKET for dispatch documents
-- =============================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('dispatch-documents', 'dispatch-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Accounts and Admin can upload dispatch files"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'dispatch-documents'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('ACCOUNTS', 'ADMIN')
      AND profiles.status = 'ACTIVE'
    )
  );

CREATE POLICY "Accounts and Admin can view dispatch files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'dispatch-documents'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('ACCOUNTS', 'ADMIN')
      AND profiles.status = 'ACTIVE'
    )
  );

CREATE POLICY "Admin can delete dispatch files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'dispatch-documents'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'ADMIN'
      AND profiles.status = 'ACTIVE'
    )
  );
