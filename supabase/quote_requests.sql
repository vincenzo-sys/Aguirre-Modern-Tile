-- Quote Requests table
-- Run this in Supabase SQL Editor AFTER the main schema.sql

CREATE TYPE quote_request_status AS ENUM ('new', 'reviewed', 'converted', 'archived');

CREATE TABLE quote_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  status quote_request_status NOT NULL DEFAULT 'new',

  -- Contact info
  client_name TEXT NOT NULL,
  client_email TEXT NOT NULL,
  client_phone TEXT NOT NULL,

  -- Project details
  project_type TEXT NOT NULL,
  answers JSONB NOT NULL DEFAULT '{}',

  -- Conversion tracking
  converted_job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_quote_requests_status ON quote_requests(status);
CREATE INDEX idx_quote_requests_created ON quote_requests(created_at DESC);

CREATE TRIGGER quote_requests_updated_at
  BEFORE UPDATE ON quote_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS: public can insert (website visitors), team can read/update
ALTER TABLE quote_requests ENABLE ROW LEVEL SECURITY;

-- Anyone can submit a quote request (no auth required)
CREATE POLICY "Public insert quote requests" ON quote_requests
  FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Team members can read all quote requests
CREATE POLICY "Team read quote requests" ON quote_requests
  FOR SELECT TO authenticated USING (is_team_member());

-- Owner can update quote requests (change status, link to job)
CREATE POLICY "Owner update quote requests" ON quote_requests
  FOR UPDATE TO authenticated USING (is_owner());
