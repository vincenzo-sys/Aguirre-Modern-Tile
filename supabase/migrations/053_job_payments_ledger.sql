-- Migration 053: job_payments — a real payment ledger for check/cash/Zelle.
--
-- THE PROBLEM, MEASURED AGAINST THE LIVE DATABASE ON 2026-08-23
--   92 jobs      SUM(estimated_cost)      = $390,861.84
--                SUM(amount_paid)         =   $6,867.89   -> 1.76% coverage
--   32 finished  (status completed + paid)
--                SUM(estimated_cost)      = $162,889.35
--                SUM(amount_paid)         =   $6,516.89
--                20 of those 32 sit at amount_paid = 0.00 ($110,000.41)
--
--   And the smoking gun:
--                SUM(final_payment_amount) = $0.00   across ALL 92 jobs
--                rows with final_payment_at IS NOT NULL = 0
--
--   Every dollar the CRM has ever recorded ($6,866.89, 14 jobs) is a Stripe
--   deposit. The check/cash channel is not "underused" — it has NEVER recorded
--   a single payment, in the entire history of the business.
--
-- WHY IT WAS NEVER USED — the shape, not the willingness
--   1. ONE SLOT, NOT A LEDGER. final_payment_amount is a scalar and
--      final_payment_{at,method,note,by_profile_id} are singular columns, so
--      payment #2 silently overwrites payment #1's metadata. A tile job is
--      deposit -> progress draw -> final check. The schema can hold one.
--   2. NO PAST DATES. The route stamps final_payment_at = now(). A check that
--      cleared in June cannot be entered as June — which also makes a backfill
--      impossible through the API, because final_payment_at is the PRIMARY
--      completion anchor for the review-request and reseal crons
--      (googleReview.ts completionAnchorField). Backfilling 20 jobs through the
--      old route would tell those crons 20 jobs finished today.
--   3. RECORDING MONEY MOVES STATUS. The route flips status -> 'paid' when the
--      payment covers estimated_cost — and when estimated_cost is 0 or NULL,
--      coversBalance is unconditionally TRUE, so ANY payment on an unpriced job
--      marks it fully paid. Honest partial entry is punished.
--   4. NO ENTRY POINT FOR HALF THE BOARD. FinalPaymentButton renders only for
--      in_progress/completed/paid; DepositReceivedAction only for lead/quoted
--      AND only once AND owner-only. Jobs at scheduled / accepted_not_scheduled
--      / awaiting_response / estimate_revised (15 jobs, ~$104k) have nowhere at
--      all to put a check.
--   5. NO READ PATH. Nothing in the UI or API ever lists what was recorded, so
--      there is no way to check your own work and no reason to trust it.
--
-- THE FIX — INVERT OWNERSHIP, DO NOT ADD A FOURTH CHANNEL
--   The tempting move is a payments table that sits BESIDE deposit_paid and
--   final_payment_amount. That double-counts: recomputeJobFinancials
--   (src/lib/jobPayments.ts) already sums those two columns plus paid invoices,
--   and migration 045 exists precisely because a recompute that misses a
--   channel wipes real money.
--
--   So instead: job_payments becomes the ONLY writer of manual money, and
--   jobs.deposit_paid / jobs.final_payment_amount / jobs.amount_paid become a
--   DERIVED READ-MODEL maintained by a trigger on this table.
--
--     deposit_paid         := SUM(ledger WHERE kind = 'deposit')
--     final_payment_amount := SUM(ledger WHERE kind <> 'deposit')
--     amount_paid          := those two + SUM(paid invoices)
--
--   Consequences, all of them good:
--     * ZERO double counting — the scalars ARE the ledger, by construction.
--     * ZERO changes required in stripeReconcile.ts, completionInvoice.ts,
--       backsplashBooking.ts, the Stripe webhook, the jobs PATCH route, or
--       recomputeJobFinancials. They read the same columns and get the same
--       (now trustworthy) numbers.
--     * The projection lives in the DATABASE, so a future writer that forgets
--       to call the app-layer helper still cannot desync the rollup. That is
--       the exact failure 045 was written to clean up.
--
--   Stripe INVOICE payments deliberately stay OUT of this table — they are
--   channel 1 and are summed from invoices.status = 'paid'. The `source` CHECK
--   has no 'stripe_invoice' value, so there is no way to represent one here and
--   therefore no way to double-count one.
--
-- Run: node scripts/run-migration.mjs supabase/migrations/053_job_payments_ledger.sql
-- Idempotent (IF NOT EXISTS / CREATE OR REPLACE / guarded backfill).
-- Additive: no column is dropped and no existing amount_paid value changes —
-- section 6 backfills the ledger FROM the current scalars, so the first
-- projection reproduces today's numbers exactly.

-- ============================================================
-- 1. The ledger
-- ============================================================
CREATE TABLE IF NOT EXISTS job_payments (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id     UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,

  -- Signed dollars. Positive = money in. Negative = refund/chargeback, so the
  -- SUM below nets out without a second table or a sign column to forget.
  amount     NUMERIC(10,2) NOT NULL CHECK (amount <> 0),

  method     TEXT NOT NULL DEFAULT 'check'
             CHECK (method IN ('check','cash','zelle','venmo','stripe','other')),

  -- Which bucket of the job this money is. Drives the projection: 'deposit'
  -- lands in jobs.deposit_paid, everything else in jobs.final_payment_amount.
  kind       TEXT NOT NULL DEFAULT 'payment'
             CHECK (kind IN ('deposit','progress','final','payment','refund')),

  -- WHEN THE MONEY ACTUALLY MOVED — the whole reason a backfill is possible.
  -- Distinct from created_at (when it was typed in). Backdating is the normal
  -- case for this business: Vin records Thursday's check on Sunday night.
  paid_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  reference  TEXT,   -- check number, Zelle confirmation, "cash in envelope"
  note       TEXT,

  source     TEXT NOT NULL DEFAULT 'manual'
             CHECK (source IN ('manual','stripe_checkout','backfill','import')),
  -- Stripe Checkout session id (source='stripe_checkout'). The partial unique
  -- index below makes crediting idempotent on the Stripe object itself.
  external_id TEXT,

  recorded_by_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,

  -- Soft delete. A mistyped payment must leave a trace — money that silently
  -- vanishes from a ledger is exactly the problem this table is fixing.
  voided_at     TIMESTAMPTZ,
  voided_reason TEXT,
  voided_by_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- A refund is the only negative, and a negative is only ever a refund.
  -- Without this, a fat-fingered "-4500" reads as a payment that shrinks the
  -- rollup with no audit signal.
  CONSTRAINT job_payments_refund_sign CHECK ((kind = 'refund') = (amount < 0))
);

CREATE INDEX IF NOT EXISTS idx_job_payments_job
  ON job_payments (job_id, paid_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_payments_paid_at
  ON job_payments (paid_at DESC) WHERE voided_at IS NULL;

-- Idempotency on the external object, not on our own guesswork. Redelivery of
-- the same Stripe session is a no-op; a genuine second session still credits.
CREATE UNIQUE INDEX IF NOT EXISTS idx_job_payments_external
  ON job_payments (external_id) WHERE external_id IS NOT NULL;

COMMENT ON TABLE job_payments IS
  'Every non-Stripe-invoice payment against a job: checks, cash, Zelle, Venmo, Stripe Checkout deposits. System of record; jobs.deposit_paid / final_payment_amount / amount_paid are projections of it (trigger job_payments_project).';
COMMENT ON COLUMN job_payments.paid_at IS
  'When the money moved, not when it was typed in. Backdatable — this is what makes historical backfill safe.';

ALTER TABLE job_payments ENABLE ROW LEVEL SECURITY;
-- Crew record cash/checks on site, same as they already can via
-- FinalPaymentButton on InstallerJobCard, so INSERT is team-wide. Voiding and
-- editing stay with the owner: reversing money is not a field decision.
DROP POLICY IF EXISTS "Team read job_payments" ON job_payments;
CREATE POLICY "Team read job_payments" ON job_payments
  FOR SELECT TO authenticated USING (is_team_member());
DROP POLICY IF EXISTS "Team record job_payments" ON job_payments;
CREATE POLICY "Team record job_payments" ON job_payments
  FOR INSERT TO authenticated WITH CHECK (is_team_member());
DROP POLICY IF EXISTS "Owner manage job_payments" ON job_payments;
CREATE POLICY "Owner manage job_payments" ON job_payments
  FOR UPDATE TO authenticated USING (is_owner()) WITH CHECK (is_owner());
DROP POLICY IF EXISTS "Owner delete job_payments" ON job_payments;
CREATE POLICY "Owner delete job_payments" ON job_payments
  FOR DELETE TO authenticated USING (is_owner());

-- ============================================================
-- 2. Let a bulk write skip the updated_at bump
-- ============================================================
-- jobs.updated_at is the LAST-RESORT completion anchor (googleReview.ts:
-- final_payment_at -> scheduled_end -> updated_at). The review-request cron
-- texts jobs whose anchor is 2-30 days old. A backfill that touches 30 job rows
-- therefore re-dates 30 jobs to "finished today" and walks them into that
-- window two days later.
--
-- Backwards compatible by construction: when the GUC is unset,
-- current_setting(..., true) returns NULL, the IF is false, and this behaves
-- byte-identically to the original one-liner in schema.sql. Only a caller that
-- explicitly opts in with `SET LOCAL app.preserve_updated_at = 'on'` — i.e. the
-- backfill script, inside its own transaction — gets the preserving path.
CREATE OR REPLACE FUNCTION update_updated_at() RETURNS TRIGGER AS $$
BEGIN
  IF coalesce(current_setting('app.preserve_updated_at', true), '') = 'on' THEN
    NEW.updated_at = OLD.updated_at;
  ELSE
    NEW.updated_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 3. The projection
-- ============================================================
-- Recomputes (never increments) from the ledger, so it is idempotent under any
-- number of re-fires and self-heals after a manual DELETE or an UPDATE that
-- moves a row between kinds.
CREATE OR REPLACE FUNCTION job_payments_project() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_job_id  UUID := COALESCE(NEW.job_id, OLD.job_id);
  v_deposit NUMERIC := 0;
  v_other   NUMERIC := 0;
  v_inv     NUMERIC := 0;
BEGIN
  SELECT COALESCE(SUM(amount) FILTER (WHERE kind =  'deposit'), 0),
         COALESCE(SUM(amount) FILTER (WHERE kind <> 'deposit'), 0)
    INTO v_deposit, v_other
    FROM job_payments
   WHERE job_id = v_job_id AND voided_at IS NULL;

  -- Channel 1 stays where it lives. Summed here (not incremented) so
  -- amount_paid is correct even if nothing calls recomputeJobFinancials.
  SELECT COALESCE(SUM(amount), 0) INTO v_inv
    FROM invoices WHERE job_id = v_job_id AND status = 'paid';

  UPDATE jobs
     SET deposit_paid         = ROUND(v_deposit, 2),
         final_payment_amount = ROUND(v_other, 2),
         amount_paid          = ROUND(v_deposit + v_other + v_inv, 2)
   WHERE id = v_job_id;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS job_payments_project ON job_payments;
CREATE TRIGGER job_payments_project
  AFTER INSERT OR UPDATE OR DELETE ON job_payments
  FOR EACH ROW EXECUTE FUNCTION job_payments_project();

COMMENT ON FUNCTION job_payments_project() IS
  'Projects the job_payments ledger onto jobs.deposit_paid / final_payment_amount / amount_paid. Recompute, not increment — idempotent and self-healing.';

-- ============================================================
-- 4. Rewire the Stripe deposit RPC onto the ledger
-- ============================================================
-- Same signature, same return contract, same processed_deposit_sessions write
-- (stripeReconcile.ts reads that ledger to compute "unexplained deposit" — do
-- NOT remove it). The only change: credit by INSERTING a ledger row and let the
-- trigger project, instead of bumping deposit_paid directly. If it kept bumping
-- the column, the next ledger write on that job would recompute the column from
-- the ledger and WIPE the Stripe credit.
CREATE OR REPLACE FUNCTION record_deposit(p_session_id TEXT, p_job_id UUID, p_amount NUMERIC)
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO processed_deposit_sessions (session_id, job_id, amount)
  VALUES (p_session_id, p_job_id, p_amount)
  ON CONFLICT (session_id) DO NOTHING;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  INSERT INTO job_payments (job_id, amount, method, kind, source, external_id, note)
  VALUES (p_job_id, p_amount, 'stripe', 'deposit', 'stripe_checkout', p_session_id,
          'Stripe Checkout deposit')
  ON CONFLICT (external_id) WHERE external_id IS NOT NULL DO NOTHING;

  RETURN true;
END;
$$;

-- Deprecated, but redefined rather than dropped: a stale caller that still
-- increments the scalar would be silently erased by the next projection. Now
-- every caller lands in the ledger no matter which door it came through.
CREATE OR REPLACE FUNCTION increment_job_final_payment(p_job_id UUID, p_delta NUMERIC)
RETURNS NUMERIC LANGUAGE plpgsql AS $$
DECLARE v NUMERIC;
BEGIN
  INSERT INTO job_payments (job_id, amount, method, kind, source, note)
  VALUES (p_job_id, p_delta, 'other',
          CASE WHEN p_delta < 0 THEN 'refund' ELSE 'final' END,
          'manual', 'via increment_job_final_payment (deprecated)');
  SELECT final_payment_amount INTO v FROM jobs WHERE id = p_job_id;
  RETURN v;
END;
$$;

COMMENT ON FUNCTION increment_job_final_payment(UUID, NUMERIC) IS
  'DEPRECATED — use POST /api/jobs/[id]/payments. Kept only so legacy callers still land in job_payments instead of desyncing the projection.';

-- ============================================================
-- 5. Owner-facing convenience: record a payment in one call
-- ============================================================
-- Exists for psql / scripts / the MCP server, which have no HTTP session. The
-- API route does the same INSERT directly.
CREATE OR REPLACE FUNCTION record_job_payment(
  p_job_id     UUID,
  p_amount     NUMERIC,
  p_method     TEXT DEFAULT 'check',
  p_kind       TEXT DEFAULT 'payment',
  p_paid_at    TIMESTAMPTZ DEFAULT NOW(),
  p_reference  TEXT DEFAULT NULL,
  p_note       TEXT DEFAULT NULL,
  p_source     TEXT DEFAULT 'manual',
  p_recorded_by UUID DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO job_payments (job_id, amount, method, kind, paid_at, reference, note, source, recorded_by_profile_id)
  VALUES (p_job_id, p_amount, p_method, p_kind, p_paid_at, p_reference, p_note, p_source, p_recorded_by)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION record_job_payment(UUID, NUMERIC, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT, UUID)
  TO authenticated, service_role;

-- ============================================================
-- 6. Seed the ledger from today's scalars (NOT the 32-job backfill)
-- ============================================================
-- This is NOT the historical backfill Vin has to review — it is the migration
-- making itself consistent. Right now 14 jobs carry deposit_paid totalling
-- $6,866.89 and every final_payment_amount is 0.00. Without this, the first
-- ledger write on one of those 14 jobs would project deposit_paid = SUM(ledger)
-- = 0 and DELETE $6,866.89 of real, already-collected money.
--
-- Guarded on NOT EXISTS so re-running cannot duplicate. paid_at falls back
-- through the same chain the rest of the codebase uses, and source='backfill'
-- marks every row as reconstructed rather than observed — which is exactly what
-- stripeReconcile.ts's "unexplained deposit" check keys on staying true.
--
-- SET LOCAL: seeding fires the projection on 14 job rows. Without this, all 14
-- get updated_at = today, which is the last-resort completion anchor. Section 2
-- explains why that matters. Transaction-scoped; released on COMMIT. If this
-- file is run outside a transaction the SET is a no-op warning and the seed
-- still works — it just bumps updated_at, exactly as it would have before.
SET LOCAL app.preserve_updated_at = 'on';

INSERT INTO job_payments (job_id, amount, method, kind, paid_at, source, note)
SELECT j.id,
       ROUND(j.deposit_paid, 2),
       'other',
       'deposit',
       COALESCE(j.estimate_accepted_at, j.created_at),
       'backfill',
       'Reconstructed from jobs.deposit_paid at migration 053. Channel unknown (Stripe Checkout or hand-logged).'
  FROM jobs j
 WHERE COALESCE(j.deposit_paid, 0) > 0
   AND NOT EXISTS (SELECT 1 FROM job_payments p WHERE p.job_id = j.id);

INSERT INTO job_payments (job_id, amount, method, kind, paid_at, source, note)
SELECT j.id,
       ROUND(j.final_payment_amount, 2),
       COALESCE(j.final_payment_method, 'other'),
       'final',
       COALESCE(j.final_payment_at, j.updated_at),
       'backfill',
       COALESCE(j.final_payment_note, 'Reconstructed from jobs.final_payment_amount at migration 053.')
  FROM jobs j
 WHERE COALESCE(j.final_payment_amount, 0) > 0
   AND NOT EXISTS (
     SELECT 1 FROM job_payments p WHERE p.job_id = j.id AND p.kind <> 'deposit'
   );
-- (Expected to insert 0 rows today: SUM(final_payment_amount) = $0.00.)

RESET app.preserve_updated_at;

-- ============================================================
-- Verification (run by hand after applying)
-- ============================================================
-- Ledger seeded and the projection reproduced today's numbers EXACTLY.
-- Expected: 14 rows, $6,866.89, and zero drift.
--   SELECT COUNT(*), SUM(amount) FROM job_payments;
--   SELECT COUNT(*) AS drifted FROM jobs j
--    WHERE ROUND(COALESCE(j.amount_paid,0),2) <> ROUND(
--            COALESCE((SELECT SUM(amount) FROM job_payments p
--                       WHERE p.job_id=j.id AND p.voided_at IS NULL),0)
--          + COALESCE((SELECT SUM(amount) FROM invoices i
--                       WHERE i.job_id=j.id AND i.status='paid'),0), 2);
--
-- Board total is unchanged by the migration. Expected: $6,867.89.
--   SELECT SUM(amount_paid) FROM jobs;
--
-- Trigger is live. Expected: job_payments_project, tgenabled = 'O'.
--   SELECT tgname, tgenabled FROM pg_trigger
--    WHERE tgrelid = 'public.job_payments'::regclass AND NOT tgisinternal;
