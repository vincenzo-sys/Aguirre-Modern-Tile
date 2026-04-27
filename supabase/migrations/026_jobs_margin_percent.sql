-- Migration 026: Persist margin_percent on jobs.
--
-- The estimator computes margin_percent on every generate (revenue minus
-- material cost minus labor cost, divided by revenue) and used to return
-- it only in the API response. After a page refresh the number was gone,
-- so the lead workspace couldn't show a "you're at 38%" anywhere — the
-- only place it surfaced was the post-Generate toast.
--
-- Storing it on the job lets the lead page display it on every visit
-- and lets the JobLineItems editor show the latest server-computed
-- value while the user is editing (with a client-side recompute when
-- inputs change). The value can drift if line items are hand-edited,
-- which is fine — recomputing client-side from catalog prices brings
-- it back in sync.

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS margin_percent NUMERIC(5,2);

COMMENT ON COLUMN jobs.margin_percent IS
  'Profit margin (0-100) computed by the estimator at last generate. '
  'Hand-edits to line_items can drift this value; the dashboard re-computes '
  'on the fly using materials_pricing.your_cost + labor_rates day rate.';
