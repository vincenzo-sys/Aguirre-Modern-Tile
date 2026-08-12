import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Integration test for migration 048 against a REAL Postgres (pglite = Postgres
// compiled to WASM, in-process — no Docker, runs in CI). It applies the actual
// migration file that will run against prod, then exercises the plpgsql it
// creates. Same approach as migration045.integration.test.ts.
//
// What makes this worth the cold start: record_job_estimate_version() has to
// demote the old row and insert the new one WITHOUT ever tripping the two
// partial unique indexes (one current per option, one primary per job), and it
// carries the coalescing rules that decide whether an edit branches a version
// or folds into the last one. None of that is expressible in a unit test with a
// mocked client — it is Postgres behaviour or it is nothing.

const U = (n: number) => `00000000-0000-0000-0000-0000000000${String(n).padStart(2, '0')}`

const VINCE = U(90)
const CHRISTIAN = U(91)

// Jobs seeded before the migration so the backfill has something to convert.
const JOB_WITH_ITEMS = U(1)
const JOB_SECOND = U(2)
const JOB_NO_ITEMS = U(3)
// Jobs created after the migration, for the RPC tests.
const JOB_FRESH = U(10)
const JOB_SENT = U(11)
const JOB_OPTIONS = U(12)
const JOB_INDEXES = U(13)

const ITEMS = (amount: number) =>
  JSON.stringify([
    { category: 'materials', description: 'Porcelain 12x24', quantity: 1, unit: 'ea', unit_price: amount, amount },
  ])

describe('migration 048 — job_estimates options + version history (real Postgres)', () => {
  let db: PGlite

  beforeAll(async () => {
    db = new PGlite()

    // CREATE POLICY ... TO authenticated needs the Supabase role to exist.
    await db.exec(`CREATE ROLE authenticated;`)

    // Minimal slice of the schema the migration references. jobs must carry
    // every column the RPC copies, because it reads jobs%ROWTYPE.
    await db.exec(`
      CREATE TABLE profiles (
        id uuid PRIMARY KEY,
        role text,
        is_active boolean DEFAULT true
      );
      CREATE TABLE jobs (
        id uuid PRIMARY KEY,
        line_items jsonb NOT NULL DEFAULT '[]',
        scopes jsonb NOT NULL DEFAULT '[]',
        scope_notes text,
        estimated_cost numeric(10,2),
        estimated_days integer,
        margin_percent numeric(5,2),
        customer_provides text,
        warranty_text text,
        payment_terms_text text,
        payment_methods jsonb,
        estimate_sent_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      -- RLS helpers the policies depend on (schema.sql:137-144).
      CREATE OR REPLACE FUNCTION is_owner() RETURNS BOOLEAN AS $$
      BEGIN RETURN true; END; $$ LANGUAGE plpgsql SECURITY DEFINER;
      CREATE OR REPLACE FUNCTION is_team_member() RETURNS BOOLEAN AS $$
      BEGIN RETURN true; END; $$ LANGUAGE plpgsql SECURITY DEFINER;
    `)

    await db.exec(`
      INSERT INTO profiles (id, role) VALUES ('${VINCE}', 'owner'), ('${CHRISTIAN}', 'owner');
      INSERT INTO jobs (id, line_items, estimated_cost, estimated_days, margin_percent, scope_notes)
      VALUES
        ('${JOB_WITH_ITEMS}', '${ITEMS(8420)}'::jsonb, 8420, 4, 41.5, 'Bathroom floor + shower'),
        ('${JOB_SECOND}',     '${ITEMS(3100)}'::jsonb, 3100, 2, 38.0, 'Backsplash'),
        ('${JOB_NO_ITEMS}',   '[]'::jsonb,              NULL, NULL, NULL, NULL);
    `)

    // Apply the ACTUAL migration file (not a copy).
    const sql = readFileSync(
      resolve('supabase/migrations/048_estimate_options_and_versions.sql'),
      'utf8'
    )
    await db.exec(sql)
  }, 60_000) // pglite loads a WASM Postgres on first boot — allow a generous cold start

  afterAll(async () => {
    await db.close()
  })

  // ── helpers ───────────────────────────────────────────────────────────────

  type Row = {
    id: string
    option_key: string
    label: string
    version: number
    is_current: boolean
    is_primary: boolean
    estimated_cost: string | null
    change_note: string | null
    created_by: string | null
  }

  async function rows(jobId: string): Promise<Row[]> {
    const { rows } = await db.query<Row>(
      `SELECT id, option_key, label, version, is_current, is_primary,
              estimated_cost, change_note, created_by
         FROM job_estimates WHERE job_id = $1
        ORDER BY option_key, version`,
      [jobId]
    )
    return rows
  }

  async function record(
    jobId: string,
    opts: {
      optionKey?: string | null
      note?: string | null
      by?: string | null
      coalesceSeconds?: number
    } = {}
  ) {
    const { rows } = await db.query<{
      estimate_id: string
      estimate_version: number
      was_coalesced: boolean
    }>(
      `SELECT * FROM record_job_estimate_version($1, $2, $3, $4, $5)`,
      [
        jobId,
        opts.optionKey ?? null,
        opts.note ?? null,
        opts.by ?? null,
        opts.coalesceSeconds ?? 600,
      ]
    )
    return rows[0]
  }

  async function setCost(jobId: string, cost: number) {
    await db.query(`UPDATE jobs SET line_items = $2::jsonb, estimated_cost = $3 WHERE id = $1`, [
      jobId,
      ITEMS(cost),
      cost,
    ])
  }

  // ── backfill ──────────────────────────────────────────────────────────────

  it('backfills one current+primary v1 option for every job that has line items', async () => {
    const r = await rows(JOB_WITH_ITEMS)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({
      option_key: 'a',
      label: 'Standard',
      version: 1,
      is_current: true,
      is_primary: true,
    })
    expect(Number(r[0].estimated_cost)).toBe(8420)
    expect(r[0].change_note).toContain('Backfilled')

    // The second job is independent — backfill is per-job, not global.
    expect(await rows(JOB_SECOND)).toHaveLength(1)
  })

  it('skips jobs with no line items, so an empty lead does not get a phantom quote', async () => {
    expect(await rows(JOB_NO_ITEMS)).toHaveLength(0)
  })

  it('backfill is re-runnable — the NOT EXISTS guard stops a second copy', async () => {
    // Re-running the INSERT (as a re-applied migration would) must be a no-op.
    await db.exec(`
      INSERT INTO job_estimates (job_id, option_key, label, sort_order, version,
        is_current, is_primary, line_items, estimated_cost, change_note)
      SELECT j.id, 'a', 'Standard', 0, 1, true, true, j.line_items, j.estimated_cost, 'dupe attempt'
      FROM jobs j
      WHERE jsonb_array_length(COALESCE(j.line_items, '[]'::jsonb)) > 0
        AND NOT EXISTS (SELECT 1 FROM job_estimates e WHERE e.job_id = j.id);
    `)
    expect(await rows(JOB_WITH_ITEMS)).toHaveLength(1)
  })

  // ── first version / branching ─────────────────────────────────────────────

  it('creates v1 as current AND primary for a job that has no options yet', async () => {
    await db.query(`INSERT INTO jobs (id, line_items, estimated_cost) VALUES ($1, $2::jsonb, 5000)`, [
      JOB_FRESH,
      ITEMS(5000),
    ])

    const res = await record(JOB_FRESH, { by: VINCE, note: 'initial estimate' })
    expect(res.estimate_version).toBe(1)
    expect(res.was_coalesced).toBe(false)

    const r = await rows(JOB_FRESH)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ version: 1, is_current: true, is_primary: true, option_key: 'a' })
  })

  it('branches a new version when coalescing is disabled, and hands primacy forward', async () => {
    await setCost(JOB_FRESH, 5600)
    const res = await record(JOB_FRESH, { by: VINCE, coalesceSeconds: 0, note: 'added niche' })
    expect(res.estimate_version).toBe(2)
    expect(res.was_coalesced).toBe(false)

    const r = await rows(JOB_FRESH)
    expect(r).toHaveLength(2)
    // v1 is retired but retains its ORIGINAL numbers — that is the whole point.
    expect(r[0]).toMatchObject({ version: 1, is_current: false, is_primary: false })
    expect(Number(r[0].estimated_cost)).toBe(5000)
    // v2 is live and now carries primacy.
    expect(r[1]).toMatchObject({ version: 2, is_current: true, is_primary: true })
    expect(Number(r[1].estimated_cost)).toBe(5600)
  })

  // ── coalescing ────────────────────────────────────────────────────────────

  it('folds a same-actor edit inside the window into the current version', async () => {
    await setCost(JOB_FRESH, 5700)
    const res = await record(JOB_FRESH, { by: VINCE, note: 'tweak' })
    expect(res.was_coalesced).toBe(true)
    expect(res.estimate_version).toBe(2)

    const r = await rows(JOB_FRESH)
    expect(r).toHaveLength(2) // still two rows — no noise version
    expect(Number(r[1].estimated_cost)).toBe(5700) // but the live row moved
    expect(r[1].change_note).toBe('tweak')
  })

  it('branches when a DIFFERENT actor edits, so authorship is never misattributed', async () => {
    await setCost(JOB_FRESH, 5900)
    const res = await record(JOB_FRESH, { by: CHRISTIAN })
    expect(res.was_coalesced).toBe(false)
    expect(res.estimate_version).toBe(3)

    const r = await rows(JOB_FRESH)
    expect(r).toHaveLength(3)
    expect(r[1].created_by).toBe(VINCE)
    expect(r[2].created_by).toBe(CHRISTIAN)
  })

  it('branches once the coalesce window has passed', async () => {
    await db.query(
      `UPDATE job_estimates SET created_at = now() - interval '2 hours'
        WHERE job_id = $1 AND is_current`,
      [JOB_FRESH]
    )
    await setCost(JOB_FRESH, 6100)
    const res = await record(JOB_FRESH, { by: CHRISTIAN })
    expect(res.was_coalesced).toBe(false)
    expect(res.estimate_version).toBe(4)
  })

  it('never coalesces across a send — a number the customer saw becomes immutable', async () => {
    await db.query(`INSERT INTO jobs (id, line_items, estimated_cost) VALUES ($1, $2::jsonb, 9000)`, [
      JOB_SENT,
      ITEMS(9000),
    ])
    await record(JOB_SENT, { by: VINCE, note: 'v1' })

    // Estimate goes out to the customer.
    await db.query(`UPDATE jobs SET estimate_sent_at = now() WHERE id = $1`, [JOB_SENT])

    // Same actor, same 10-minute window — would normally coalesce.
    await setCost(JOB_SENT, 9400)
    const res = await record(JOB_SENT, { by: VINCE, note: 'post-send revision' })
    expect(res.was_coalesced).toBe(false)
    expect(res.estimate_version).toBe(2)

    const r = await rows(JOB_SENT)
    expect(Number(r[0].estimated_cost)).toBe(9000) // what they actually saw, preserved
    expect(Number(r[1].estimated_cost)).toBe(9400)
  })

  // ── multiple options ──────────────────────────────────────────────────────

  it('versions a secondary option without stealing primacy from the primary one', async () => {
    await db.query(`INSERT INTO jobs (id, line_items, estimated_cost) VALUES ($1, $2::jsonb, 8000)`, [
      JOB_OPTIONS,
      ITEMS(8000),
    ])
    await record(JOB_OPTIONS, { by: VINCE }) // option 'a' v1, primary

    // Vince adds an "Upgraded" option and prices it.
    await db.query(
      `INSERT INTO job_estimates (job_id, option_key, label, sort_order, version,
         is_current, is_primary, line_items, estimated_cost)
       VALUES ($1, 'b', 'Upgraded', 1, 1, true, false, $2::jsonb, 10150)`,
      [JOB_OPTIONS, ITEMS(10150)]
    )

    await setCost(JOB_OPTIONS, 10600)
    const res = await record(JOB_OPTIONS, { optionKey: 'b', by: VINCE, coalesceSeconds: 0 })
    expect(res.estimate_version).toBe(2)

    const r = await rows(JOB_OPTIONS)
    const primary = r.filter((x) => x.is_primary)
    expect(primary).toHaveLength(1)
    expect(primary[0].option_key).toBe('a') // 'a' still mirrors onto jobs.*

    const bRows = r.filter((x) => x.option_key === 'b')
    expect(bRows.map((x) => x.version)).toEqual([1, 2])
    expect(bRows.find((x) => x.is_current)?.version).toBe(2)
    expect(bRows.find((x) => x.is_current)?.label).toBe('Upgraded') // label carried forward
  })

  it('defaults to the primary option when no option_key is given', async () => {
    await setCost(JOB_OPTIONS, 8300)
    const res = await record(JOB_OPTIONS, { by: CHRISTIAN, coalesceSeconds: 0 })
    const r = await rows(JOB_OPTIONS)
    const live = r.find((x) => x.is_current && x.option_key === 'a')
    expect(live?.version).toBe(res.estimate_version)
    expect(Number(live?.estimated_cost)).toBe(8300)
  })

  // ── payload writes + mirroring ────────────────────────────────────────────

  async function job(jobId: string) {
    const { rows } = await db.query<{
      estimated_cost: string | null
      estimated_days: number | null
      scope_notes: string | null
      line_items: unknown
    }>(`SELECT estimated_cost, estimated_days, scope_notes, line_items FROM jobs WHERE id = $1`, [
      jobId,
    ])
    return rows[0]
  }

  async function recordWithPayload(
    jobId: string,
    optionKey: string,
    payload: Record<string, unknown>,
    by: string | null = VINCE
  ) {
    const { rows } = await db.query<{ estimate_version: number; was_coalesced: boolean }>(
      `SELECT * FROM record_job_estimate_version($1, $2, $3, $4, $5, $6::jsonb)`,
      [jobId, optionKey, 'payload edit', by, 0, JSON.stringify(payload)]
    )
    return rows[0]
  }

  it('editing a SECONDARY option leaves jobs.* — and therefore the Stripe deposit — alone', async () => {
    const before = await job(JOB_OPTIONS)

    await recordWithPayload(JOB_OPTIONS, 'b', { line_items: JSON.parse(ITEMS(12000)) })

    const after = await job(JOB_OPTIONS)
    expect(after.estimated_cost).toBe(before.estimated_cost) // untouched

    const r = await rows(JOB_OPTIONS)
    const liveB = r.find((x) => x.option_key === 'b' && x.is_current)
    expect(Number(liveB?.estimated_cost)).toBe(12000) // but the option moved
  })

  it('editing the PRIMARY option mirrors onto jobs.* so downstream stays in sync', async () => {
    await recordWithPayload(JOB_OPTIONS, 'a', { line_items: JSON.parse(ITEMS(7777)) })

    const j = await job(JOB_OPTIONS)
    expect(Number(j.estimated_cost)).toBe(7777)
  })

  it('derives the total from line items when the payload omits it', async () => {
    await recordWithPayload(JOB_OPTIONS, 'a', {
      line_items: [
        { category: 'materials', description: 'Tile', quantity: 1, unit: 'ea', unit_price: 1200, amount: 1200 },
        { category: 'labor', description: 'Install', quantity: 2, unit: 'day', unit_price: 1000, amount: 2000 },
      ],
    })

    const j = await job(JOB_OPTIONS)
    expect(Number(j.estimated_cost)).toBe(3200)
  })

  it('keeps each option\'s SCOPE TEXT separate — editing B never rewrites A', async () => {
    // The question this answers: "when I switch to Option B and change the
    // customer scope, does it clobber Option A?" Scope belongs to the option
    // it describes — porcelain and marble are different work — so the two must
    // not share a single string.
    await recordWithPayload(JOB_OPTIONS, 'a', { scope_notes: 'A: full retile in porcelain' })
    await recordWithPayload(JOB_OPTIONS, 'b', { scope_notes: 'B: marble, large format, new niche' })

    const { rows: scopes } = await db.query<{ option_key: string; scope_notes: string }>(
      `SELECT option_key, scope_notes FROM job_estimates
        WHERE job_id = $1 AND is_current ORDER BY option_key`,
      [JOB_OPTIONS]
    )
    expect(scopes.find((s) => s.option_key === 'a')?.scope_notes).toBe('A: full retile in porcelain')
    expect(scopes.find((s) => s.option_key === 'b')?.scope_notes).toBe(
      'B: marble, large format, new niche'
    )

    // And the job still carries the mirrored option's scope, not B's.
    const j = await job(JOB_OPTIONS)
    expect(j.scope_notes).toBe('A: full retile in porcelain')

    // Editing B again leaves A's text alone (the real regression risk).
    await recordWithPayload(JOB_OPTIONS, 'b', { scope_notes: 'B: revised marble scope' })
    const { rows: after } = await db.query<{ option_key: string; scope_notes: string }>(
      `SELECT option_key, scope_notes FROM job_estimates
        WHERE job_id = $1 AND is_current ORDER BY option_key`,
      [JOB_OPTIONS]
    )
    expect(after.find((s) => s.option_key === 'a')?.scope_notes).toBe('A: full retile in porcelain')
    expect(after.find((s) => s.option_key === 'b')?.scope_notes).toBe('B: revised marble scope')
    expect((await job(JOB_OPTIONS)).scope_notes).toBe('A: full retile in porcelain')
  })

  it('applies only the keys present, so a one-field edit does not blank the quote', async () => {
    await recordWithPayload(JOB_OPTIONS, 'a', { scope_notes: 'Updated scope text' })

    const j = await job(JOB_OPTIONS)
    expect(j.scope_notes).toBe('Updated scope text')
    expect(Number(j.estimated_cost)).toBe(3200) // carried forward, not nulled
  })

  // ── promoting an option ───────────────────────────────────────────────────

  it('set_primary_estimate_option promotes an option onto the job and moves primacy', async () => {
    const promoted = await db.query<{ estimated_cost: string }>(
      `SELECT * FROM set_primary_estimate_option($1, 'b', true)`,
      [JOB_OPTIONS]
    )
    expect(Number(promoted.rows[0].estimated_cost)).toBe(12000)

    // The job now IS option b — this is what makes the Stripe deposit correct
    // without the checkout route or webhook knowing options exist.
    const j = await job(JOB_OPTIONS)
    expect(Number(j.estimated_cost)).toBe(12000)

    const r = await rows(JOB_OPTIONS)
    const primary = r.filter((x) => x.is_primary)
    expect(primary).toHaveLength(1)
    expect(primary[0].option_key).toBe('b')
  })

  it('stamps selected_at on customer choice but leaves it alone for an internal switch', async () => {
    const { rows: sel } = await db.query<{ selected_at: string | null }>(
      `SELECT selected_at FROM job_estimates WHERE job_id = $1 AND option_key = 'b' AND is_current`,
      [JOB_OPTIONS]
    )
    expect(sel[0].selected_at).not.toBeNull()

    // Switching back internally must not fabricate customer intent.
    await db.query(`SELECT * FROM set_primary_estimate_option($1, 'a', false)`, [JOB_OPTIONS])
    const { rows: a } = await db.query<{ selected_at: string | null }>(
      `SELECT selected_at FROM job_estimates WHERE job_id = $1 AND option_key = 'a' AND is_current`,
      [JOB_OPTIONS]
    )
    expect(a[0].selected_at).toBeNull()
  })

  it('refuses to promote an option that does not exist rather than silently no-oping', async () => {
    await expect(
      db.query(`SELECT * FROM set_primary_estimate_option($1, 'zz', false)`, [JOB_OPTIONS])
    ).rejects.toThrow(/no current option/)
  })

  // ── invariants ────────────────────────────────────────────────────────────

  it('enforces one current version per option, one primary per job, unique versions', async () => {
    await db.query(`INSERT INTO jobs (id, line_items, estimated_cost) VALUES ($1, $2::jsonb, 1000)`, [
      JOB_INDEXES,
      ITEMS(1000),
    ])
    await record(JOB_INDEXES, { by: VINCE })

    // Second current row for the same option.
    await expect(
      db.query(
        `INSERT INTO job_estimates (job_id, option_key, version, is_current, is_primary)
         VALUES ($1, 'a', 99, true, false)`,
        [JOB_INDEXES]
      )
    ).rejects.toThrow(/job_estimates_one_current/)

    // Second primary row for the same job (different option).
    await expect(
      db.query(
        `INSERT INTO job_estimates (job_id, option_key, version, is_current, is_primary)
         VALUES ($1, 'z', 1, false, true)`,
        [JOB_INDEXES]
      )
    ).rejects.toThrow(/job_estimates_one_primary/)

    // Duplicate version number within an option.
    await expect(
      db.query(
        `INSERT INTO job_estimates (job_id, option_key, version, is_current, is_primary)
         VALUES ($1, 'a', 1, false, false)`,
        [JOB_INDEXES]
      )
    ).rejects.toThrow(/job_estimates_version_key/)
  })

  it('raises rather than silently no-oping when the job does not exist', async () => {
    await expect(record(U(77), { by: VINCE })).rejects.toThrow(/job .* not found/)
  })

  it('cascades away with the job, leaving no orphaned quote history', async () => {
    await db.query(`DELETE FROM jobs WHERE id = $1`, [JOB_INDEXES])
    expect(await rows(JOB_INDEXES)).toHaveLength(0)
  })
})
