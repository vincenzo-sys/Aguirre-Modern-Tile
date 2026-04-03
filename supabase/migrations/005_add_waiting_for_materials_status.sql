-- Migration 005: Add 'waiting_for_materials' to job_status enum
-- Run this in Supabase SQL Editor

ALTER TYPE job_status ADD VALUE IF NOT EXISTS 'waiting_for_materials' AFTER 'in_progress';
