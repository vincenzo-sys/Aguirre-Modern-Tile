-- Spam gate for the public intake forms.
--
-- Aug 2026: a bot campaign put 15 fake leads into quote_requests (7 on Aug 13
-- alone) and ~110 junk rows into customers. Each submission fired the full
-- automation chain — OpenPhone contact, auto-SMS, Notion job, and a
-- "Got your tile project request" email to whatever address the bot supplied.
-- Several of those were real third parties, which means the Resend domain that
-- also carries estimates and invoices was emailing strangers.
--
-- Design notes:
--   * is_spam is a plain boolean column, NOT a new value on the status enum.
--     ALTER TYPE ... ADD VALUE can't be used in the same transaction that uses
--     it, and scripts/run-migration.mjs wraps each file in one transaction.
--     A boolean also leaves every existing status filter working untouched.
--   * Suspect leads are QUARANTINED, never dropped. The row is always written
--     so a false positive costs a click in the dashboard, not a customer.

alter table quote_requests
  add column if not exists is_spam boolean not null default false,
  add column if not exists spam_score integer,
  add column if not exists spam_reasons text[];

comment on column quote_requests.is_spam is
  'Quarantined by the intake spam gate. Row is kept for review; no outbound automation fires for it.';
comment on column quote_requests.spam_score is
  'Points accumulated by src/lib/spamCheck.ts. >= SPAM_THRESHOLD quarantines.';
comment on column quote_requests.spam_reasons is
  'Human-readable signals that fired, so the gate can be tuned from real data.';

-- The dashboard lists live leads constantly; quarantined ones should never
-- cost a sequential scan to exclude.
create index if not exists quote_requests_is_spam_idx
  on quote_requests (is_spam, created_at desc);

alter table customers
  add column if not exists is_spam boolean not null default false;

comment on column customers.is_spam is
  'Junk row created by a bot submission before the spam gate existed, or quarantined since.';

create index if not exists customers_is_spam_idx on customers (is_spam);

-- Persistent rate limiting.
--
-- src/lib/validation.ts kept an in-memory Map at module scope. On Vercel each
-- serverless instance has its own copy and loses it on cold start, so it never
-- actually limited anything in production. Counting has to live somewhere both
-- instances can see.
create table if not exists rate_limit_hits (
  id         bigserial primary key,
  bucket     text        not null,
  created_at timestamptz not null default now()
);

comment on table rate_limit_hits is
  'One row per accepted public form submission. Bucket is like "quotes:ip:1.2.3.4" or "quotes:email:foo@gmail.com" (gmail-normalized). Rows older than a day are disposable.';

create index if not exists rate_limit_hits_bucket_idx
  on rate_limit_hits (bucket, created_at desc);

-- Backfill: flag the known bot campaign so it stops polluting the dashboard and
-- the nurture cron. Signature is a single mixed-case alphabetic token of 15+
-- characters with no space — it matches all 15 known bot leads and none of the
-- real customers (Tiffany, Holly Wang, Adam Powell, Jeffrey Kushmerek).
update quote_requests
   set is_spam      = true,
       spam_reasons = coalesce(spam_reasons, array[]::text[]) || array['backfill:bot_name_signature'],
       status       = case when status::text in ('converted') then status else 'archived'::quote_request_status end
 where client_name ~ '^[A-Za-z]{15,}$'
   and client_name ~ '[a-z]'
   and client_name ~ '[A-Z]'
   and is_spam = false;

update customers
   set is_spam = true
 where name ~ '^[A-Za-z]{15,}$'
   and name ~ '[a-z]'
   and name ~ '[A-Z]'
   and is_spam = false
   -- never quarantine a customer who has real work attached
   and not exists (select 1 from jobs      j where j.customer_id = customers.id)
   and not exists (select 1 from invoices  i where i.customer_id = customers.id);
