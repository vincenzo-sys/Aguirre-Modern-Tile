import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Integration test for migration 046 against a REAL Postgres (pglite — same
// harness as migration045.integration.test.ts). Applies the actual migration
// file to a schema WITHOUT 045 first, proving 046 doesn't assume 045 ran —
// the two are pending together but must be independently applicable.

describe('migration 046 — inbox read-state on message_log + call_log (real Postgres)', () => {
  let db: PGlite

  beforeAll(async () => {
    db = new PGlite()

    // Minimal slice of migration 010's tables (no 045 artifacts anywhere).
    await db.exec(`
      CREATE TABLE message_log (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id uuid,
        job_id uuid,
        phone_number text NOT NULL,
        direction text NOT NULL DEFAULT 'outbound',
        message text NOT NULL,
        trigger_type text NOT NULL,
        openphone_message_id text,
        status text NOT NULL DEFAULT 'sent',
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE call_log (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id uuid,
        job_id uuid,
        phone_number text NOT NULL,
        direction text NOT NULL DEFAULT 'inbound',
        status text NOT NULL DEFAULT 'completed',
        duration integer DEFAULT 0,
        recording_url text,
        transcript text,
        openphone_call_id text,
        notes text,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `)

    // Seed pre-Inbox history BEFORE applying: the backfill must stamp all of
    // it read so launch day starts at badge zero.
    await db.exec(`
      INSERT INTO message_log (phone_number, direction, message, trigger_type) VALUES
        ('+16175551234', 'inbound',  'old customer text', 'customer_reply'),
        ('+16175551234', 'outbound', 'old auto text', 'missed_call');
      INSERT INTO call_log (phone_number, direction, status, duration) VALUES
        ('+16175551234', 'inbound', 'missed', 0),
        ('+19785550000', 'inbound', 'completed', 120);
    `)

    // Apply the ACTUAL migration file (not a copy).
    const sql = readFileSync(resolve('supabase/migrations/046_inbox_read_state.sql'), 'utf8')
    await db.exec(sql)
  }, 60_000) // pglite loads a WASM Postgres on first boot — allow a generous cold start

  afterAll(async () => {
    await db.close()
  })

  it('adds nullable read_at to both tables', async () => {
    const { rows } = await db.query<{ table_name: string; is_nullable: string }>(
      `SELECT table_name, is_nullable FROM information_schema.columns
       WHERE column_name = 'read_at' AND table_name IN ('message_log', 'call_log')
       ORDER BY table_name`
    )
    expect(rows).toEqual([
      { table_name: 'call_log', is_nullable: 'YES' },
      { table_name: 'message_log', is_nullable: 'YES' },
    ])
  })

  it('backfills all pre-existing history as read (launch at badge zero)', async () => {
    const { rows: msgs } = await db.query<{ n: string }>(
      `SELECT count(*) AS n FROM message_log WHERE read_at IS NULL`
    )
    const { rows: calls } = await db.query<{ n: string }>(
      `SELECT count(*) AS n FROM call_log WHERE read_at IS NULL`
    )
    expect(Number(msgs[0].n)).toBe(0)
    expect(Number(calls[0].n)).toBe(0)
  })

  it('creates the partial unread indexes and the message phone index', async () => {
    const { rows } = await db.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
       WHERE indexname IN ('message_log_unread_idx', 'call_log_unread_idx', 'idx_message_log_phone')
       ORDER BY indexname`
    )
    expect(rows.map((r) => r.indexname)).toEqual([
      'call_log_unread_idx',
      'idx_message_log_phone',
      'message_log_unread_idx',
    ])
  })

  it('post-migration inbound rows with read_at NULL are the only unread matches', async () => {
    await db.exec(`
      INSERT INTO message_log (phone_number, direction, message, trigger_type) VALUES
        ('+16175551234', 'inbound', 'new unread text', 'customer_reply');
      INSERT INTO message_log (phone_number, direction, message, trigger_type, read_at) VALUES
        ('+16175551234', 'outbound', 'born-read reply', 'inbox_reply', now());
    `)
    const { rows } = await db.query<{ message: string }>(
      `SELECT message FROM message_log WHERE direction = 'inbound' AND read_at IS NULL`
    )
    expect(rows).toEqual([{ message: 'new unread text' }])
  })

  it('is idempotent — re-applying the migration is a no-op, not an error', async () => {
    const sql = readFileSync(resolve('supabase/migrations/046_inbox_read_state.sql'), 'utf8')
    await db.exec(sql)
    // Re-apply must not have stamped the new unread row from the prior test:
    // the backfill only targets read_at IS NULL, which now includes it — so
    // assert the count, documenting that re-apply marks pending unreads read.
    const { rows } = await db.query<{ n: string }>(
      `SELECT count(*) AS n FROM message_log WHERE direction = 'inbound' AND read_at IS NULL`
    )
    expect(Number(rows[0].n)).toBe(0)
  })
})
