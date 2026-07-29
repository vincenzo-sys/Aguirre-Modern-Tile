-- Migration 047: email_log — inbound/outbound customer email for the Inbox.
-- Run once (CREATE POLICY is not idempotent): node scripts/run-migration.mjs
--
-- Mirrors message_log/call_log (010) + the read-state convention from 046.
-- Inbound rows come from the Resend receiving webhook (/api/resend/inbound);
-- outbound rows from Inbox email replies. resend_email_id dedups webhook
-- redelivery. Unread definition: direction='inbound' AND read_at IS NULL.

CREATE TABLE email_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  direction TEXT NOT NULL DEFAULT 'inbound',   -- 'inbound' | 'outbound'
  from_email TEXT NOT NULL,                    -- bare address, lowercased
  to_email TEXT,                               -- bare address, lowercased
  subject TEXT,
  body_text TEXT,
  body_html TEXT,
  resend_email_id TEXT,                        -- Resend received-email id (webhook dedup)
  message_id TEXT,                             -- RFC 5322 Message-ID (threading, phase 3)
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX email_log_resend_id_idx
  ON email_log (resend_email_id) WHERE resend_email_id IS NOT NULL;
CREATE INDEX idx_email_log_customer ON email_log (customer_id);
CREATE INDEX idx_email_log_from ON email_log (from_email);
CREATE INDEX idx_email_log_created ON email_log (created_at DESC);
CREATE INDEX email_log_unread_idx
  ON email_log (from_email) WHERE direction = 'inbound' AND read_at IS NULL;

ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team read email_log" ON email_log
  FOR SELECT TO authenticated USING (is_team_member());
CREATE POLICY "Owner manage email_log" ON email_log
  FOR ALL TO authenticated USING (is_owner()) WITH CHECK (is_owner());
