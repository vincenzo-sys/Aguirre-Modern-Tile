-- Migration 006: Add Notion sync columns for bidirectional linking
-- Run this in Supabase SQL Editor

-- Link jobs to their Notion page
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS notion_page_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_notion_page ON jobs(notion_page_id) WHERE notion_page_id IS NOT NULL;

-- Link customers to their Notion page (if applicable)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS notion_page_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_notion_page ON customers(notion_page_id) WHERE notion_page_id IS NOT NULL;

-- Track last sync time for incremental syncs
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS notion_last_synced_at TIMESTAMPTZ;
