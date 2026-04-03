-- Migration 004: Add line_items column to jobs table
-- Run this in Supabase SQL Editor AFTER 003_migrate_customer_data.sql
--
-- This allows building scope/estimates at the job level.
-- Line items on the job feed into invoice creation.
-- Format: [{ "category": "materials"|"labor", "description": "...", "quantity": 1, "unit": "sq ft"|"hr"|"ea", "unit_price": 5.00, "amount": 500.00 }]

ALTER TABLE jobs ADD COLUMN line_items JSONB NOT NULL DEFAULT '[]';
