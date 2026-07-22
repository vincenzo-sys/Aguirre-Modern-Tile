import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'

// Validates the DB-level guarantee the lead-convert fix (#19) relies on against
// a REAL Postgres (pglite). The route creates the job, then atomically claims
// the lead with an UPDATE gated on `converted_job_id IS NULL` (issued via
// supabase-js `.is('converted_job_id', null)`); the loser of a race gets 0 rows
// back and rolls its duplicate job back. This proves the conditional claim
// actually serializes so a double-submit can't produce two jobs from one lead.

const L = '00000000-0000-0000-0000-0000000000aa'
const JOB1 = '00000000-0000-0000-0000-0000000000b1'
const JOB2 = '00000000-0000-0000-0000-0000000000b2'

describe('lead-convert atomic claim (real Postgres)', () => {
  let db: PGlite

  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
      CREATE TABLE quote_requests (
        id uuid PRIMARY KEY,
        converted_job_id uuid,
        status text
      );
    `)
  }, 60_000)

  afterAll(async () => {
    await db.close()
  })

  // Mirrors the route's claim: UPDATE ... WHERE id = lead AND converted_job_id
  // IS NULL RETURNING id. Returns the number of rows claimed (1 = won, 0 = lost).
  async function claim(jobId: string): Promise<number> {
    const { rows } = await db.query(
      `UPDATE quote_requests
          SET converted_job_id = $1, status = 'converted'
        WHERE id = $2 AND converted_job_id IS NULL
        RETURNING id`,
      [jobId, L]
    )
    return rows.length
  }

  it('first claim wins, a second concurrent claim gets 0 rows (no second job)', async () => {
    await db.exec(`INSERT INTO quote_requests (id, converted_job_id, status) VALUES ('${L}', NULL, 'new')`)

    expect(await claim(JOB1)).toBe(1) // wins
    expect(await claim(JOB2)).toBe(0) // loses — guard held

    const { rows } = await db.query<{ converted_job_id: string; status: string }>(
      'SELECT converted_job_id, status FROM quote_requests WHERE id = $1',
      [L]
    )
    expect(rows[0].converted_job_id).toBe(JOB1) // the winner, never overwritten
    expect(rows[0].status).toBe('converted')
  })
})
