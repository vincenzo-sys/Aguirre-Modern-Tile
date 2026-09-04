// Repair for migration 053's missing final-payment seed.
//
// 053 seeded the job_payments ledger from jobs.deposit_paid only — when it was
// written (2026-08-23) no job had a final payment. Two were recorded after
// that, and the projection trigger zeroed them on apply. Re-seed exactly those
// two from the surviving metadata (final_payment_at / method / note) and the
// amounts confirmed against Stripe this morning. Idempotent: re-running finds
// the rows and does nothing.
import fs from 'node:fs'
import pg from 'pg'

const t = fs.readFileSync('.env.local', 'utf8')
for (const l of t.split('\n')) {
  const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

const REPAIR = [
  { job_number: 67, amount: 630.0, email: 'johnmacadam604@gmail.com' },
  { job_number: 74, amount: 1066.5, email: 'dmcgee314@gmail.com' },
]
const EXPECTED = { paid: '19492.40', dep: '17794.90', fin: '1696.50', inv: '2502.00' }

const c = new pg.Client({ connectionString: process.env.DATABASE_URI, ssl: { rejectUnauthorized: false } })
await c.connect()
try {
  await c.query('BEGIN')
  for (const r of REPAIR) {
    const { rows } = await c.query(
      'select id, final_payment_at, final_payment_method, final_payment_note, final_payment_by_profile_id from jobs where job_number = $1',
      [r.job_number],
    )
    if (rows.length !== 1) throw new Error(`job #${r.job_number} not found`)
    const j = rows[0]
    if (!j.final_payment_at) throw new Error(`job #${r.job_number} has no final_payment_at — refusing to guess a date`)
    const existing = await c.query(
      "select count(*)::int n from job_payments where job_id = $1 and kind = 'final'",
      [j.id],
    )
    if (existing.rows[0].n > 0) {
      console.log(`#${r.job_number}: final-payment row already present, skipping`)
      continue
    }
    await c.query(
      `insert into job_payments (job_id, amount, method, kind, paid_at, note, source, recorded_by_profile_id)
       values ($1, $2, $3, 'final', $4, $5, 'backfill', $6)`,
      [
        j.id,
        r.amount,
        j.final_payment_method ?? 'stripe',
        j.final_payment_at,
        `Re-seeded after migration 053 (which only seeded deposits). ${j.final_payment_note ?? ''}`.trim(),
        j.final_payment_by_profile_id,
      ],
    )
    console.log(`#${r.job_number}: inserted final payment $${r.amount.toFixed(2)} dated ${j.final_payment_at.toISOString().slice(0, 10)}`)
  }

  const after = (
    await c.query(
      'select sum(amount_paid)::numeric paid, sum(deposit_paid)::numeric dep, sum(final_payment_amount)::numeric fin, sum(amount_invoiced)::numeric inv from jobs',
    )
  ).rows[0]
  console.log('after :', JSON.stringify(after))
  console.log('expect:', JSON.stringify(EXPECTED))
  const ok = Object.keys(EXPECTED).every((k) => after[k] === EXPECTED[k])
  if (!ok) {
    await c.query('ROLLBACK')
    console.log('*** BASELINE STILL MISMATCHED — rolled back, nothing written ***')
    process.exit(1)
  }
  await c.query('COMMIT')
  console.log('BASELINE RESTORED — committed')
} catch (e) {
  await c.query('ROLLBACK').catch(() => {})
  console.error('FAILED, rolled back:', e.message)
  process.exit(1)
} finally {
  await c.end()
}
