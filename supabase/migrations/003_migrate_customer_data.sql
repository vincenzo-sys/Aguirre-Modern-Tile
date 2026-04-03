-- Migration 003: Migrate existing client data into customers table
-- Run this in Supabase SQL Editor AFTER 002_add_customer_fk.sql
--
-- Strategy: Deduplicate by email (primary), then phone (secondary).
-- Jobs with neither email nor phone get a customer created from name alone.

-- Step 1: Create customers from jobs with email (deduplicate by lowercase email)
INSERT INTO customers (name, email, phone, address, source)
SELECT DISTINCT ON (LOWER(client_email))
  client_name,
  client_email,
  client_phone,
  client_address,
  'manual'
FROM jobs
WHERE client_email IS NOT NULL AND client_email != ''
ORDER BY LOWER(client_email), created_at ASC;

-- Step 2: Create customers from jobs WITHOUT email but WITH phone (deduplicate by phone)
INSERT INTO customers (name, phone, address, source)
SELECT DISTINCT ON (client_phone)
  client_name,
  client_phone,
  client_address,
  'manual'
FROM jobs
WHERE (client_email IS NULL OR client_email = '')
  AND client_phone IS NOT NULL AND client_phone != ''
  AND NOT EXISTS (
    SELECT 1 FROM customers c WHERE c.phone = jobs.client_phone
  )
ORDER BY client_phone, created_at ASC;

-- Step 3: Create customers from jobs with neither email nor phone (by name)
INSERT INTO customers (name, address, source)
SELECT DISTINCT ON (client_name)
  client_name,
  client_address,
  'manual'
FROM jobs
WHERE (client_email IS NULL OR client_email = '')
  AND (client_phone IS NULL OR client_phone = '')
ORDER BY client_name, created_at ASC;

-- Step 4: Backfill customer_id on jobs (match by email first, then phone, then name)
UPDATE jobs SET customer_id = c.id
FROM customers c
WHERE jobs.customer_id IS NULL
  AND jobs.client_email IS NOT NULL AND jobs.client_email != ''
  AND LOWER(c.email) = LOWER(jobs.client_email);

UPDATE jobs SET customer_id = c.id
FROM customers c
WHERE jobs.customer_id IS NULL
  AND jobs.client_phone IS NOT NULL AND jobs.client_phone != ''
  AND c.phone = jobs.client_phone;

UPDATE jobs SET customer_id = c.id
FROM customers c
WHERE jobs.customer_id IS NULL
  AND c.name = jobs.client_name
  AND c.email IS NULL AND c.phone IS NULL;

-- Step 5: Create customers from quote_requests that don't match existing customers
INSERT INTO customers (name, email, phone, source)
SELECT DISTINCT ON (LOWER(qr.client_email))
  qr.client_name,
  qr.client_email,
  qr.client_phone,
  'website'
FROM quote_requests qr
WHERE NOT EXISTS (
  SELECT 1 FROM customers c WHERE LOWER(c.email) = LOWER(qr.client_email)
)
AND qr.client_email IS NOT NULL AND qr.client_email != ''
ORDER BY LOWER(qr.client_email), qr.created_at ASC;

-- Step 6: Backfill customer_id on quote_requests
UPDATE quote_requests SET customer_id = c.id
FROM customers c
WHERE quote_requests.customer_id IS NULL
  AND LOWER(c.email) = LOWER(quote_requests.client_email);

UPDATE quote_requests SET customer_id = c.id
FROM customers c
WHERE quote_requests.customer_id IS NULL
  AND c.phone = quote_requests.client_phone;

-- Step 7: Backfill customer_id on invoices (from their linked job)
UPDATE invoices SET customer_id = j.customer_id
FROM jobs j
WHERE invoices.job_id = j.id
  AND invoices.customer_id IS NULL
  AND j.customer_id IS NOT NULL;

-- Step 8: Migrate stripe_customer_id from jobs to customers
UPDATE customers SET stripe_customer_id = j.stripe_customer_id
FROM jobs j
WHERE customers.id = j.customer_id
  AND j.stripe_customer_id IS NOT NULL
  AND customers.stripe_customer_id IS NULL;
