-- Migration 052: collision-proof invoice_number allocation.
--
-- THE BUG
--   POST /api/invoices derived the number from COUNT(*) + 1. Verified against
--   the live database on 2026-08-21:
--     rows            = INV-2026-001, INV-2026-002, INV-2026-004  (3 rows)
--     COUNT(*) + 1    -> INV-2026-004   <- already exists
--     MAX(suffix) + 1 -> INV-2026-005   <- correct
--   INV-2026-003 was deleted at some point. That single gap makes COUNT(*)
--   permanently lag MAX(suffix), so the generator points at an occupied slot
--   FOREVER, not just once. invoice_number is NOT NULL UNIQUE, so this is a
--   hard 23505 -> 500, not a silent duplicate. Vin has never been able to raise
--   an invoice from the dashboard.
--
--   Second, subtler failure: even MAX(suffix)+1 computed in the app is a
--   read-modify-write race. Two concurrent POSTs both read {001,002,004}, both
--   compute 005, one wins and one 500s.
--
-- THE FIX — two independent layers, each correct on its own.
--
--   LAYER 1 (this migration): the database allocates the number itself, inside
--   the INSERT's own transaction, under an advisory lock keyed on the year.
--   This covers EVERY writer — the API route, the completion cron, and the four
--   scripts/*.mjs that INSERT raw SQL — without any of them changing. Any writer
--   that omits invoice_number (or passes NULL) gets a correct one. A writer that
--   supplies its own number is left alone, so nothing existing breaks.
--
--   LAYER 2 (src/app/api/invoices/route.ts): the route still computes a number
--   with nextInvoiceNumber() and RETRIES on 23505, re-reading the max each
--   attempt. That layer works with ZERO migrations applied — which matters,
--   because migration 040 was written in March and still is not applied. The
--   UNIQUE index below is what makes that retry correct: it is the arbiter that
--   serializes the racers.
--
-- Run: node scripts/run-migration.mjs supabase/migrations/052_invoice_number_allocation.sql
-- Idempotent and additive. Adds no column, rewrites no row, changes no existing
-- number. Safe to apply before or after the code deploy, in either order.

-- ── 1. Guarantee the UNIQUE constraint the whole scheme rests on ──────────
-- Already present in prod as invoices_invoice_number_key (confirmed 2026-08-21),
-- so this is a no-op there. It exists for fresh/branch databases built from
-- migrations rather than schema.sql, where it would otherwise be missing and
-- the retry in layer 2 would have nothing to arbitrate it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_index i
      JOIN pg_class idx ON idx.oid = i.indexrelid
      JOIN pg_class rel ON rel.oid = i.indrelid
      JOIN pg_namespace ns ON ns.oid = rel.relnamespace
     WHERE ns.nspname = 'public'
       AND rel.relname = 'invoices'
       AND i.indisunique
       AND i.indnatts = 1
       AND pg_get_indexdef(i.indexrelid) LIKE '%(invoice_number)%'
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_invoice_number_key UNIQUE (invoice_number);
  END IF;
END $$;

-- ── 2. The allocator ──────────────────────────────────────────────────────
-- Derives from the TABLE, never from a stored counter. A counter row would be
-- faster, but it silently drifts the moment anyone inserts an invoice by hand
-- (scripts/draft-wayne-invoice.mjs, scripts/paul-hunt-final-invoice.mjs, and
-- Supabase Studio all do exactly that), and a drifted counter reintroduces this
-- exact bug. Reading MAX(suffix) cannot drift. At three invoices a year the
-- scan costs nothing.
CREATE OR REPLACE FUNCTION public.next_invoice_number(p_year int)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_seq       int;
  v_candidate text;
BEGIN
  -- Serialize allocators for this year until the caller's transaction ends.
  -- Held across the subsequent INSERT, so the read and the write are atomic
  -- with respect to each other. Released automatically on COMMIT or ROLLBACK —
  -- there is no leak path, even if the INSERT raises.
  PERFORM pg_advisory_xact_lock(hashtext('public.invoices.invoice_number:' || p_year::text));

  SELECT COALESCE(MAX((regexp_match(invoice_number, '^INV-([0-9]{4})-([0-9]+)$'))[2]::int), 0)
    INTO v_seq
    FROM public.invoices
   WHERE invoice_number ~ ('^INV-' || p_year::text || '-[0-9]+$');

  -- Step past anything already taken. MAX+1 is enough in practice; the loop is
  -- what makes it true even for a hand-written number that broke the pattern.
  LOOP
    v_seq := v_seq + 1;
    v_candidate := 'INV-' || p_year::text || '-' || lpad(v_seq::text, 3, '0');
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.invoices WHERE invoice_number = v_candidate
    );
  END LOOP;

  RETURN v_candidate;
END;
$$;

COMMENT ON FUNCTION public.next_invoice_number(int) IS
  'Next free INV-YYYY-NNN for the given year. Takes a transaction-scoped advisory lock, so the caller must INSERT in the same transaction for the guarantee to hold.';

-- ── 3. Assign on INSERT when the writer did not supply a number ───────────
-- BEFORE ROW triggers run before the NOT NULL check, so filling a NULL here is
-- legal and the column stays NOT NULL.
CREATE OR REPLACE FUNCTION public.invoices_assign_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.invoice_number IS NULL OR btrim(NEW.invoice_number) = '' THEN
    NEW.invoice_number := public.next_invoice_number(
      EXTRACT(YEAR FROM COALESCE(NEW.created_at, NOW()))::int
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invoices_assign_number ON public.invoices;
CREATE TRIGGER invoices_assign_number
  BEFORE INSERT ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.invoices_assign_number();

-- Let the dashboard's authenticated role call the allocator directly if it ever
-- wants to preview a number. The trigger path needs no grant.
GRANT EXECUTE ON FUNCTION public.next_invoice_number(int) TO authenticated, service_role;

-- ── Verification (run by hand after applying) ─────────────────────────────
-- Existing duplicates — expected: 0 rows (confirmed 0 on 2026-08-21).
--   SELECT invoice_number, COUNT(*) FROM invoices
--    GROUP BY 1 HAVING COUNT(*) > 1;
--
-- Allocator agrees with the data — expected: INV-2026-005 today.
--   SELECT public.next_invoice_number(2026);
--
-- Trigger is live — expected: 1 row, tgenabled = 'O'.
--   SELECT tgname, tgenabled FROM pg_trigger
--    WHERE tgrelid = 'public.invoices'::regclass AND NOT tgisinternal;
