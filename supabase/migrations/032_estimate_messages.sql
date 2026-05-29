-- Migration 032: Threaded conversation between customer and Aguirre on an estimate.
--
-- Backs the "Questions or comments" section that lives on both the public
-- estimate page (/estimates/[token]) and the dashboard job page. One row per
-- message; thread is reconstructed by ordering on created_at within job_id.
--
-- Authorization model:
--   - Customer side: possession of the estimate token authorizes both reading
--     and posting. No login required. Token is already a UUID stored on
--     jobs.estimate_token; the public API verifies token → job_id.
--   - Aguirre side: dashboard auth (existing requireApiAuth pattern).
--
-- read_at is nullable and gets stamped when the *other* side reads the
-- message. Lets us show "Vince hasn't seen this yet" on the customer side
-- and an unread badge on Vince's dashboard.

CREATE TABLE IF NOT EXISTS estimate_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  sender text NOT NULL CHECK (sender IN ('customer', 'aguirre')),
  sender_name text,
  body text NOT NULL CHECK (length(body) > 0 AND length(body) <= 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

-- Most lookups are "give me the thread for this job, oldest first".
CREATE INDEX IF NOT EXISTS estimate_messages_job_id_created_at_idx
  ON estimate_messages (job_id, created_at);

-- For the dashboard's unread-badge query: count messages from customer
-- that haven't been read yet.
CREATE INDEX IF NOT EXISTS estimate_messages_unread_idx
  ON estimate_messages (job_id) WHERE sender = 'customer' AND read_at IS NULL;

COMMENT ON TABLE estimate_messages IS
  'Threaded customer ↔ Aguirre conversation tied to a job. Customer authenticates via possession of the estimate token; Aguirre authenticates via dashboard session.';
