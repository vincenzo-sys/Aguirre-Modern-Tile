-- Migration 014: "What the customer is providing" field on jobs
-- Run this in Supabase SQL Editor.
--
-- Customers often provide their own tile, grout, fixtures, etc. Christian
-- needs to know what NOT to bring so he doesn't duplicate-buy, and Vince
-- needs to remember what the customer is on the hook for. Free-form text.

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS customer_provides TEXT;
