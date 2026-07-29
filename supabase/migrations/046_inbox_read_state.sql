-- Migration 046: Inbox read-state on message_log + call_log.
-- Run in Supabase SQL Editor (independent of 045 — applies cleanly either way).
--
-- Mirrors estimate_messages.read_at (migration 032). Unread definition:
--   SMS : direction = 'inbound' AND read_at IS NULL
--   Call: direction = 'inbound' AND read_at IS NULL
--         (the webhook stamps answered calls read at insert time; missed and
--         voicemail rows are born unread)

ALTER TABLE message_log ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
ALTER TABLE call_log    ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

-- Backfill: all existing history predates the Inbox. Mark it read so launch
-- day starts at badge zero instead of a wall of hundreds of "unread".
UPDATE message_log SET read_at = NOW() WHERE read_at IS NULL;
UPDATE call_log    SET read_at = NOW() WHERE read_at IS NULL;

-- Partial unread indexes for the badge query (mirror
-- estimate_messages_unread_idx from migration 032). Indexed on phone_number
-- because the inbox groups and marks-read by normalized phone.
CREATE INDEX IF NOT EXISTS message_log_unread_idx
  ON message_log (phone_number) WHERE direction = 'inbound' AND read_at IS NULL;
CREATE INDEX IF NOT EXISTS call_log_unread_idx
  ON call_log (phone_number) WHERE direction = 'inbound' AND read_at IS NULL;

-- The inbox thread query is "all rows for this phone, newest first".
-- call_log already has idx_call_log_phone from migration 010.
CREATE INDEX IF NOT EXISTS idx_message_log_phone ON message_log (phone_number);
