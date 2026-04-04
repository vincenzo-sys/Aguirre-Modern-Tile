-- Migration 010: Call log + message log tables for OpenPhone integration
-- Run in Supabase SQL Editor

-- Call log — every inbound/outbound call
CREATE TABLE call_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  phone_number TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'inbound',  -- 'inbound' or 'outbound'
  status TEXT NOT NULL DEFAULT 'completed',    -- 'completed', 'missed', 'voicemail'
  duration INTEGER DEFAULT 0,                  -- seconds
  recording_url TEXT,
  transcript TEXT,
  openphone_call_id TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_call_log_customer ON call_log(customer_id);
CREATE INDEX idx_call_log_phone ON call_log(phone_number);
CREATE INDEX idx_call_log_created ON call_log(created_at DESC);

ALTER TABLE call_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team read call_log" ON call_log FOR SELECT TO authenticated USING (is_team_member());
CREATE POLICY "Owner manage call_log" ON call_log FOR ALL TO authenticated USING (is_owner()) WITH CHECK (is_owner());

-- Message log — automated texts sent to customers
CREATE TABLE message_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  phone_number TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'outbound',
  message TEXT NOT NULL,
  trigger_type TEXT NOT NULL,  -- 'missed_call', 'status_scheduled', 'status_in_progress', 'status_completed', 'invoice_sent'
  openphone_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'sent',  -- 'sent', 'delivered', 'failed'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_message_log_customer ON message_log(customer_id);
CREATE INDEX idx_message_log_created ON message_log(created_at DESC);

ALTER TABLE message_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team read message_log" ON message_log FOR SELECT TO authenticated USING (is_team_member());
CREATE POLICY "Owner manage message_log" ON message_log FOR ALL TO authenticated USING (is_owner()) WITH CHECK (is_owner());
