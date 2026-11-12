-- Email delivery to internal company recipients.
-- Additive. Safe to run more than once. Run in the Supabase SQL editor.
--
-- One logical email event per booking, milestone, scheduled date or manual send.
-- Each active recipient gets its own delivery row so failures can be retried one by one.
-- Only the server (service role) reads or writes these tables; admins reach them through
-- server actions that check the admin role first.

CREATE TABLE IF NOT EXISTS company_email_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  label TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT company_email_recipients_email_format CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

CREATE UNIQUE INDEX IF NOT EXISTS company_email_recipients_email_unique
  ON company_email_recipients (lower(email));

CREATE TABLE IF NOT EXISTS email_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'booking_finalized', 'agreement_finalized', 'milestone_completed', 'scheduled_date', 'manual_bulk', 'test', 'resend'
  )),
  event_reference TEXT,
  idempotency_key TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (
    'awaiting_recipients', 'queued', 'processing', 'sent', 'partially_failed', 'failed'
  )),
  document_count INTEGER NOT NULL DEFAULT 0,
  -- Template data, documents that could not be included, and the resend source.
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- attachments | zip | link, decided when the package is built.
  delivery_mode TEXT CHECK (delivery_mode IS NULL OR delivery_mode IN ('none', 'attachments', 'zip', 'link')),
  package_path TEXT,
  package_bytes BIGINT,
  package_expires_at TIMESTAMPTZ,
  package_built_at TIMESTAMPTZ,
  last_error TEXT,
  claim_token UUID,
  claimed_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ,
  resend_of UUID REFERENCES email_events(id),
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- One automatic event per stable key: booking-finalized:{id}, milestone-completed:{id}:v{n}, ...
CREATE UNIQUE INDEX IF NOT EXISTS email_events_idempotency_key_unique ON email_events (idempotency_key);
CREATE INDEX IF NOT EXISTS idx_email_events_status ON email_events (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_email_events_created ON email_events (created_at DESC);

CREATE TABLE IF NOT EXISTS email_event_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES email_events(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN ('allotment', 'noc', 'agreement', 'demand_note')),
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  -- demand_notes.id for demand notes, booking_generated_documents.id for agreements.
  document_id UUID,
  folder TEXT,
  file_name TEXT,
  -- Private storage copy of the exact file that was sent, so retries send the same bytes.
  storage_path TEXT,
  file_bytes BIGINT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_event_documents_event ON email_event_documents (event_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_email_event_documents_document ON email_event_documents (document_type, document_id);

CREATE TABLE IF NOT EXISTS email_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES email_events(id) ON DELETE CASCADE,
  recipient_id UUID REFERENCES company_email_recipients(id) ON DELETE SET NULL,
  recipient_email TEXT NOT NULL,
  -- queued -> sending -> sent (accepted by Resend) -> delivered / bounced / complained; or failed.
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued', 'sending', 'sent', 'delivered', 'delivery_delayed', 'bounced', 'complained', 'failed'
  )),
  provider_message_id TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  next_attempt_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS email_deliveries_event_recipient_unique ON email_deliveries (event_id, lower(recipient_email));
CREATE UNIQUE INDEX IF NOT EXISTS email_deliveries_provider_message_unique ON email_deliveries (provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_deliveries_sent_at ON email_deliveries (sent_at) WHERE sent_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS email_delivery_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES email_deliveries(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('accepted', 'failed', 'retry_scheduled', 'quota_deferred')),
  provider_message_id TEXT,
  error TEXT,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_delivery_attempts_delivery ON email_delivery_attempts (delivery_id, attempted_at);

-- Undoing and redoing a milestone is a new completion, so it gets a new email key.
ALTER TABLE construction_milestones ADD COLUMN IF NOT EXISTS completion_version INTEGER NOT NULL DEFAULT 0;

-- Automatic scheduled-date emails only consider demand notes issued after this moment,
-- so turning the feature on does not email historical notes.
ALTER TABLE settings ADD COLUMN IF NOT EXISTS email_automation_started_at TIMESTAMPTZ;
UPDATE settings SET email_automation_started_at = NOW() WHERE email_automation_started_at IS NULL;

-- Claim due events for one worker. A crashed worker's claim is taken over after p_stale_seconds.
CREATE OR REPLACE FUNCTION claim_email_events(p_limit INTEGER, p_token UUID, p_stale_seconds INTEGER)
RETURNS SETOF email_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE email_events AS e
  SET status = 'processing', claim_token = p_token, claimed_at = NOW(), updated_at = NOW()
  WHERE e.id IN (
    SELECT id FROM email_events
    WHERE (status = 'queued' AND (next_attempt_at IS NULL OR next_attempt_at <= NOW()))
       OR (status = 'processing' AND claimed_at < NOW() - make_interval(secs => p_stale_seconds))
    ORDER BY created_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING e.*;
END;
$$;

-- Claim one specific event (used right after it is created, and by Retry).
CREATE OR REPLACE FUNCTION claim_email_event(p_event_id UUID, p_token UUID, p_stale_seconds INTEGER)
RETURNS SETOF email_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE email_events AS e
  SET status = 'processing', claim_token = p_token, claimed_at = NOW(), updated_at = NOW()
  WHERE e.id = p_event_id
    AND (
      (e.status = 'queued' AND (e.next_attempt_at IS NULL OR e.next_attempt_at <= NOW()))
      OR (e.status = 'processing' AND e.claimed_at < NOW() - make_interval(secs => p_stale_seconds))
    )
  RETURNING e.*;
END;
$$;

ALTER TABLE company_email_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_event_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_delivery_attempts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON company_email_recipients, email_events, email_event_documents, email_deliveries, email_delivery_attempts FROM anon, authenticated;
GRANT ALL ON company_email_recipients, email_events, email_event_documents, email_deliveries, email_delivery_attempts TO service_role;

REVOKE ALL ON FUNCTION claim_email_events(INTEGER, UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION claim_email_event(UUID, UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_email_events(INTEGER, UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION claim_email_event(UUID, UUID, INTEGER) TO service_role;
