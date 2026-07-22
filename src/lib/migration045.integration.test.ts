import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Integration test for migration 045 against a REAL Postgres (pglite = Postgres
// compiled to WASM, in-process — no Docker, runs in CI). It applies the actual
// migration file that will run against prod, then exercises the plpgsql it
// creates. This is the highest-fidelity guard for the riskiest unexecuted
// artifact: the record_deposit idempotency, the atomic final-payment increment,
// and the reconstruction backfill that rewrites live amount_paid data.

const J = (n: number) => `00000000-0000-0000-0000-0000000000${String(n).padStart(2, '0')}`

describe('migration 045 — record_deposit / increment_job_final_payment / backfill (real Postgres)', () => {
  let db: PGlite

  beforeAll(async () => {
    db = new PGlite()

    // Minimal slice of the schema the migration + its functions reference.
    await db.exec(`
      CREATE TABLE jobs (
        id uuid PRIMARY KEY,
        amount_paid numeric(10,2) DEFAULT 0,
        final_payment_amount numeric(10,2),
        estimated_cost numeric(10,2),
        estimate_accepted_at timestamptz
      );
      CREATE TABLE invoices (
        id uuid PRIMARY KEY,
        job_id uuid,
        amount numeric(10,2),
        status text
      );
    `)

    // Seed backfill jobs BEFORE applying the migration — its backfill UPDATE
    // runs at apply time and must reconstruct deposit_paid from these.
    await db.exec(`
      INSERT INTO jobs (id, amount_paid, final_payment_amount, estimated_cost) VALUES
        ('${J(1)}', 3000, NULL, 10000),   -- deposit-only  -> reconstruct 3000
        ('${J(2)}', 10000, 2000, 12000),  -- deposit + final 2000 + paid inv 5000 -> 3000
        ('${J(3)}', 5000, 0, 8000),       -- paid invoices exceed amount_paid -> clamp 0
        ('${J(4)}', 0, NULL, 5000);       -- amount_paid 0 -> excluded, stays 0
      INSERT INTO invoices (id, job_id, amount, status) VALUES
        ('${J(20)}', '${J(2)}', 5000, 'paid'),
        ('${J(21)}', '${J(3)}', 6000, 'paid'),
        ('${J(22)}', '${J(2)}', 999, 'void');   -- void excluded from the sum
    `)

    // Apply the ACTUAL migration file (not a copy).
    const sql = readFileSync(resolve('supabase/migrations/045_payment_channels.sql'), 'utf8')
    await db.exec(sql)
  }, 60_000) // pglite loads a WASM Postgres on first boot — allow a generous cold start

  afterAll(async () => {
    await db.close()
  })

  async function depositPaid(id: string): Promise<number> {
    const { rows } = await db.query<{ deposit_paid: string }>(
      'SELECT deposit_paid FROM jobs WHERE id = $1',
      [id]
    )
    return Number(rows[0].deposit_paid)
  }

  it('backfill reconstructs deposit_paid so recompute preserves amount_paid exactly', async () => {
    expect(await depositPaid(J(1))).toBe(3000) // 3000 - 0 - 0
    expect(await depositPaid(J(2))).toBe(3000) // 10000 - 2000 - 5000 (void 999 excluded)
    expect(await depositPaid(J(3))).toBe(0) // GREATEST(5000 - 0 - 6000, 0)
    expect(await depositPaid(J(4))).toBe(0) // excluded (amount_paid = 0)
  })

  it('record_deposit credits once, no-ops on a redelivered session, sums distinct sessions', async () => {
    await db.exec(`INSERT INTO jobs (id, amount_paid) VALUES ('${J(10)}', 0)`)
    const call = async (sess: string, amt: number) => {
      const { rows } = await db.query<{ credited: boolean }>(
        'SELECT record_deposit($1, $2, $3) AS credited',
        [sess, J(10), amt]
      )
      return rows[0].credited
    }

    expect(await call('sess-A', 1000)).toBe(true)
    expect(await depositPaid(J(10))).toBe(1000)

    // Redelivery of the SAME session id → no-op, no double credit.
    expect(await call('sess-A', 1000)).toBe(false)
    expect(await depositPaid(J(10))).toBe(1000)

    // A genuinely different session (2nd real deposit) → credits again.
    expect(await call('sess-B', 500)).toBe(true)
    expect(await depositPaid(J(10))).toBe(1500)

    // Ledger holds exactly the two distinct sessions.
    const { rows } = await db.query<{ n: string }>(
      'SELECT count(*) AS n FROM processed_deposit_sessions WHERE job_id = $1',
      [J(10)]
    )
    expect(Number(rows[0].n)).toBe(2)
  })

  it('increment_job_final_payment accumulates atomically and returns the new total', async () => {
    await db.exec(`INSERT INTO jobs (id, amount_paid, final_payment_amount) VALUES ('${J(11)}', 0, NULL)`)
    const call = async (amt: number) => {
      const { rows } = await db.query<{ v: string }>(
        'SELECT increment_job_final_payment($1, $2) AS v',
        [J(11), amt]
      )
      return Number(rows[0].v)
    }
    expect(await call(250)).toBe(250)
    expect(await call(100)).toBe(350)
  })
})
