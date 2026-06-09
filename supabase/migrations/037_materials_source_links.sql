-- Migration 037: per-retailer source links on materials_pricing
-- Run this in Supabase SQL Editor (or via scripts/populate-material-source-links.mjs,
-- which runs this ADD COLUMN idempotently and then fills the data).
--
-- The catalog had a single `retail_link`, but a given material is often sold at
-- 2-3 of Floor & Decor / Lowe's / Home Depot. Store them all so the team can
-- re-check any retailer's current price. Shape:
--   { "floor_decor": "<url>", "lowes": "<url>", "home_depot": "<url>" }
-- Keys are omitted for retailers that don't carry the item.

ALTER TABLE materials_pricing
  ADD COLUMN IF NOT EXISTS source_links JSONB NOT NULL DEFAULT '{}'::jsonb;
