// Read-only check that migrations 050-060 are applied and the money survived.
// Safe to re-run any time.
import fs from 'node:fs'
import pg from 'pg'

const t = fs.readFileSync('.env.local', 'utf8')
for (const l of t.split('\n')) {
  const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

const PROBES = [
  ['050', "select to_regclass('public.partner_scans') is not null e"],
  ['051', "select exists(select 1 from information_schema.columns where table_name='invoices' and column_name='public_token') e"],
  ['052', "select exists(select 1 from pg_proc where proname='next_invoice_number') e"],
  ['053', "select to_regclass('public.job_payments') is not null e"],
  ['054', "select exists(select 1 from information_schema.columns where table_name='customers' and column_name='is_gc') e"],
  ['055', "select exists(select 1 from information_schema.columns where table_name='job_estimates' and column_name='recommended') e"],
  ['057', "select exists(select 1 from information_schema.columns where table_name='jobs' and column_name='end_customer_name') e"],
  ['058', "select exists(select 1 from information_schema.columns where table_name='job_photos' and column_name='publish_status') e"],
  ['059', "select exists(select 1 from information_schema.columns where table_name='jobs' and column_name='completed_at') e"],
  ['060', "select exists(select 1 from information_schema.columns where table_name='message_log' and column_name='error') e"],
]
const EXPECTED = { paid: '19492.40', dep: '17794.90', fin: '1696.50', inv: '2502.00' }

const c = new pg.Client({ connectionString: process.env.DATABASE_URI, ssl: { rejectUnauthorized: false } })
await c.connect()
let bad = 0
try {
  console.log('MIGRATIONS')
  for (const [n, sql] of PROBES) {
    let ok = false
    try { ok = (await c.query(sql)).rows[0].e === true } catch { ok = false }
    if (!ok) bad++
    console.log(`  ${n}  ${ok ? 'applied' : '*** MISSING ***'}`)
  }
  console.log('  056  (data-only, not probeable)')

  console.log('\nMONEY')
  const m = (await c.query('select sum(amount_paid)::numeric paid, sum(deposit_paid)::numeric dep, sum(final_payment_amount)::numeric fin, sum(amount_invoiced)::numeric inv from jobs')).rows[0]
  for (const k of Object.keys(EXPECTED)) {
    const ok = m[k] === EXPECTED[k]
    if (!ok) bad++
    console.log(`  ${k.padEnd(4)} ${String(m[k]).padStart(10)}  ${ok ? 'ok' : '*** expected ' + EXPECTED[k] + ' ***'}`)
  }
  const l = (await c.query("select count(*)::int n, sum(amount)::numeric s, count(*) filter (where kind='final')::int fin from job_payments")).rows[0]
  console.log(`  ledger: ${l.n} rows, $${l.s}, ${l.fin} final-payment rows`)

  console.log('\nGC FLAGS (should be 6)')
  const g = (await c.query('select name from customers where is_gc order by name')).rows.map((r) => r.name)
  if (g.length !== 6) bad++
  console.log(`  ${g.length}: ${g.join(' · ')}`)

  console.log('\nCOMPLETED_AT (059 backfill)')
  const ca = (await c.query("select count(*) filter (where status in ('completed','paid'))::int fin, count(*) filter (where status in ('completed','paid') and completed_at is not null)::int dated from jobs")).rows[0]
  console.log(`  ${ca.dated} of ${ca.fin} finished jobs dated`)

  console.log(bad === 0 ? '\nALL GOOD' : `\n*** ${bad} PROBLEM(S) ***`)
  process.exit(bad === 0 ? 0 : 1)
} finally {
  await c.end()
}
