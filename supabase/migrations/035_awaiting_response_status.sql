-- Migration 035: Add 'awaiting_response' job status
--
-- Purpose: split the post-estimate phase into two manual stages — "Quoted"
-- (just sent, give the customer a beat) and "Awaiting response" (it's been
-- too long, Vince is now actively chasing). The act of dragging a card from
-- Quoted → Awaiting is itself the cue that follow-up work starts.
--
-- Why a separate status and not a flag: the leads pipeline's stage column
-- maps 1:1 to jobs.status. Adding a flag would force every consumer
-- (kanban, /api/pipeline, the saveStage handler) to special-case it.
-- Run this in Supabase SQL Editor.

BEGIN;

ALTER TYPE job_status ADD VALUE IF NOT EXISTS 'awaiting_response' AFTER 'estimate_revised';

COMMIT;
