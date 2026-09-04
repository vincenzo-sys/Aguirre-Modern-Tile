-- Migration 051: auto-drafted completion invoices.
--
-- Two jobs in one file.
--
-- PART A — finish migration 040, which was written but NEVER APPLIED.
--   Verified against the live database on 2026-08-20:
--     select public_token from invoices  ->  42703 column does not exist
--   That single missing column is why creating an invoice from the dashboard
--   fails today: POST /api/invoices inserts public_token unconditionally, so
--   every call 500s. /api/invoices/[id]/send-link (public_link_sent_at) and the
--   customer-facing /invoices/[token] page are broken for the same reason.
--   The statements are copied verbatim from 040 and are IF NOT EXISTS, so
--   applying 051 alone is sufficient, and applying 040 first is harmless.
--
-- PART B — let an auto-drafted invoice explain itself.
--   /api/cron/completion-invoices drafts the final-balance invoice for finished
--   jobs. Those drafts are NOT safe to send blind: as of 2026-08-20 every job
--   at status 'completed' has amount_paid = 0, because final payments arrive as
--   checks nobody records. needs_review + review_flags carry that doubt onto
--   the row so the dashboard can say "verify before sending" instead of the
--   owner having to remember which drafts a machine wrote.
--
-- Run: node scripts/run-migration.mjs supabase/migrations/051_completion_invoice_automation.sql
-- Idempotent (IF NOT EXISTS) and additive only — no existing column or
-- behaviour changes, so it is safe to apply ahead of the code deploy. The code
-- also degrades gracefully if this is never run (see completionInvoice.ts).

-- ── Part A: migration 040's columns ──────────────────────────────────────
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS public_token TEXT,
  ADD COLUMN IF NOT EXISTS stripe_hosted_url TEXT,
  ADD COLUMN IF NOT EXISTS public_link_sent_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_public_token
  ON invoices (public_token)
  WHERE public_token IS NOT NULL;

-- Backfill tokens for the invoices that predate this. Two uuids stripped of
-- hyphens matches the slug shape used by the estimate/work-order tokens.
UPDATE invoices
SET public_token = replace(gen_random_uuid()::text, '-', '') ||
                   replace(gen_random_uuid()::text, '-', '')
WHERE public_token IS NULL;

-- ── Part B: provenance + review state ────────────────────────────────────
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS auto_generated BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS needs_review   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_flags   JSONB   NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN invoices.auto_generated IS
  'Drafted by /api/cron/completion-invoices or the completed-status hook, not by a human.';
COMMENT ON COLUMN invoices.needs_review IS
  'True when the balance was derived from a payment ledger with known gaps. Do not send without checking.';
COMMENT ON COLUMN invoices.review_flags IS
  'Why needs_review is set: no-payments-recorded / anchor-is-updated-at / no-contact-on-file.';

-- Every existing invoice was created by hand, so the defaults are already
-- correct for them; no backfill needed.

-- The dashboard's "needs attention" query wants drafts that a machine wrote.
-- Partial index keeps it cheap as the table grows.
CREATE INDEX IF NOT EXISTS idx_invoices_auto_draft_review
  ON invoices (created_at DESC)
  WHERE auto_generated = true AND status = 'draft';
