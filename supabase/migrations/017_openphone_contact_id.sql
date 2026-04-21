-- Migration 017: Cache OpenPhone contact ID on customers
-- Run this in Supabase SQL Editor.
--
-- Purpose:
--   When the website quote/contact form runs, we also push the lead into
--   OpenPhone (aka "quo") as a named contact so Vince's incoming calls /
--   texts show a name instead of an unknown number. Store the OpenPhone
--   contact id here so repeat submissions don't create duplicates.

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS openphone_contact_id TEXT;

CREATE INDEX IF NOT EXISTS idx_customers_openphone_contact_id
  ON customers(openphone_contact_id)
  WHERE openphone_contact_id IS NOT NULL;
