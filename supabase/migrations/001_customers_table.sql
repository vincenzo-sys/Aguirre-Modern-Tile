-- Migration 001: Create customers table
-- Run this in Supabase SQL Editor

-- Customers table - central CRM entity
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'manual',  -- 'website', 'manual', 'referral', 'repeat'
  stripe_customer_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial unique indexes: enforce uniqueness only when value exists
-- This allows multiple NULLs (e.g. customers with no email)
CREATE UNIQUE INDEX idx_customers_email ON customers(LOWER(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX idx_customers_phone ON customers(phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_customers_name ON customers(name);
CREATE INDEX idx_customers_source ON customers(source);
CREATE INDEX idx_customers_created ON customers(created_at DESC);

-- Auto-update timestamp (reuses existing function from schema.sql)
CREATE TRIGGER customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS: matches existing pattern (team reads, owner CUD)
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team read customers" ON customers
  FOR SELECT TO authenticated USING (is_team_member());

CREATE POLICY "Owner create customers" ON customers
  FOR INSERT TO authenticated WITH CHECK (is_owner());

CREATE POLICY "Owner update customers" ON customers
  FOR UPDATE TO authenticated USING (is_owner());

CREATE POLICY "Owner delete customers" ON customers
  FOR DELETE TO authenticated USING (is_owner());

-- Allow anonymous/public insert for website form submissions
-- (quote API uses service role, but this is a safety net)
CREATE POLICY "Public insert customers" ON customers
  FOR INSERT TO anon WITH CHECK (source = 'website');
