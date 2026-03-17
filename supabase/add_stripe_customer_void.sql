-- Migration: Add stripe_customer_id to jobs, add 'void' to invoice status
-- Run this in the Supabase SQL Editor

-- Add stripe_customer_id column to jobs table
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS stripe_customer_id text;

-- If you have a CHECK constraint on invoices.status, update it to include 'void':
-- ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
-- ALTER TABLE invoices ADD CONSTRAINT invoices_status_check
--   CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'void'));

-- If using an enum type instead:
-- ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'void';
