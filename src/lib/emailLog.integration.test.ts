import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Integration test for migration 047 (email_log) against real Postgres via
// pglite — same harness as migration045/046 tests. Stubs the auth helper
// functions the RLS policies reference (they live in Supabase's base schema).

describe('migration 047 — email_log (real Postgres)', () => {
  let db: PGlite

  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
      CREATE TABLE customers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text);
      CREATE TABLE jobs (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE ROLE authenticated;
      CREATE FUNCTION is_team_member() RETURNS boolean LANGUAGE sql AS 'SELECT true';
      CREATE FUNCTION is_owner() RETURNS boolean LANGUAGE sql AS 'SELECT true';
    `)
    const sql = readFileSync(resolve('supabase/migrations/047_email_log.sql'), 'utf8')
    await db.exec(sql)
  }, 60_000)

  afterAll(async () => {
    await db.close()
  })

  it('accepts an inbound email row, born unread', async () => {
    await db.exec(`
      INSERT INTO email_log (direction, from_email, to_email, subject, body_text, resend_email_id)
      VALUES ('inbound', 'jane@example.com', 'vince@reply.moderntile.pro', 'Question', 'About my estimate', 're_abc');
    `)
    const { rows } = await db.query<{ n: string }>(
      `SELECT count(*) AS n FROM email_log WHERE direction='inbound' AND read_at IS NULL`
    )
    expect(Number(rows[0].n)).toBe(1)
  })

  it('dedups on resend_email_id (webhook redelivery)', async () => {
    let failed = false
    try {
      await db.exec(`
        INSERT INTO email_log (direction, from_email, subject, resend_email_id)
        VALUES ('inbound', 'jane@example.com', 'Question', 're_abc');
      `)
    } catch {
      failed = true
    }
    expect(failed).toBe(true)
    // NULL resend_email_id rows (outbound replies) never conflict.
    await db.exec(`
      INSERT INTO email_log (direction, from_email, to_email, subject) VALUES
        ('outbound', 'vince@reply.moderntile.pro', 'jane@example.com', 'Re: Question'),
        ('outbound', 'vince@reply.moderntile.pro', 'jane@example.com', 'Re: Question again');
    `)
    const { rows } = await db.query<{ n: string }>(`SELECT count(*) AS n FROM email_log`)
    expect(Number(rows[0].n)).toBe(3)
  })

  it('created the unread partial index', async () => {
    const { rows } = await db.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE indexname = 'email_log_unread_idx'`
    )
    expect(rows).toHaveLength(1)
  })
})
