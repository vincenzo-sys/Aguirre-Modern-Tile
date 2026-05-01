-- Crew approval workflow: Vince requests Christian's sign-off on an
-- estimate before sending it to the customer. Christian taps a link in
-- an SMS, lands on the dashboard job detail with an Approve / Needs
-- Changes banner, and the result writes back here.
--
-- Status values:
--   pending  — Vince fired a request; waiting on Christian's response
--   approved — Christian agreed with the price
--   rejected — Christian flagged something (notes capture the why)
--   NULL     — never requested (default)
--
-- Single jobs row carries the latest state. Re-requesting after rejection
-- overwrites — we don't need a history table for this; message_log already
-- preserves the SMS audit trail.

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS crew_approval_status TEXT
    CHECK (crew_approval_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS crew_approval_notes TEXT,
  ADD COLUMN IF NOT EXISTS crew_approval_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS crew_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS crew_approved_by UUID REFERENCES profiles(id);

-- Partial index for the "what's waiting on me" dashboard query the crew
-- view will run. Most jobs never get a crew approval request, so a
-- partial index keeps the index tiny.
CREATE INDEX IF NOT EXISTS jobs_crew_approval_pending_idx
  ON jobs(crew_approval_requested_at DESC)
  WHERE crew_approval_status = 'pending';
