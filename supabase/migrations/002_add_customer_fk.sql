-- Migration 002: Add customer_id foreign keys to existing tables
-- Run this in Supabase SQL Editor AFTER 001_customers_table.sql

-- Add customer_id to jobs (nullable for backward compatibility)
ALTER TABLE jobs ADD COLUMN customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;
CREATE INDEX idx_jobs_customer ON jobs(customer_id);

-- Add customer_id to quote_requests
ALTER TABLE quote_requests ADD COLUMN customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;
CREATE INDEX idx_quote_requests_customer ON quote_requests(customer_id);

-- Add customer_id to invoices
ALTER TABLE invoices ADD COLUMN customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;
CREATE INDEX idx_invoices_customer ON invoices(customer_id);
