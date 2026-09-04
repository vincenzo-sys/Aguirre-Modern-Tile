// Companion to migration 054.
//
// 054 adds customers.is_gc NOT NULL DEFAULT FALSE and flags four customers by
// name. But the live code decides "is this a GC?" with looksLikeGc() — a name
// regex — whenever is_gc is not a boolean, and 054 makes it a boolean (false)
// for everyone. Any GC the allowlist misses silently becomes retail: required
// deposit drops from 25% to 10%, no error, no visible change. Three of the six
// GCs in the customers table today are not on 054's list.
//
// This sets is_gc from the exact same regex the code uses, so the column is a
// faithful snapshot of today's behaviour on the day it starts being read.
// Idempotent. Run right after 054 (and 057, which re-adds the column).
import fs from 'node:fs'
import pg from 'pg'

const t = fs.readFileSync('.env.local', 'utf8')
for (const l of t.split('\n')) {
  const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

// Port of looksLikeGc() in src/lib/depositGate.ts. Postgres word boundary is \y.
const LOOKS_LIKE_GC = String.raw`\(\s*g\.?c\.?\s*\)|\yg\.c\.\y|\ygc\y|\ynjz\y|construction\y|contracting\y|\ybuilders?\y`

const c = new pg.Client({ connectionString: process.env.DATABASE_URI, ssl: { rejectUnauthorized: false } })
await c.connect()
try {
  const before = (await c.query('select name from customers where is_gc order by name')).rows.map((r) => r.name)
  console.log('is_gc = TRUE before:', before.length, JSON.stringify(before))

  const res = await c.query('update customers set is_gc = true where is_gc = false and name ~* $1 returning name', [LOOKS_LIKE_GC])
  for (const r of res.rows) console.log('  flagged:', r.name)

  const after = (await c.query('select name from customers where is_gc order by name')).rows.map((r) => r.name)
  console.log('is_gc = TRUE after :', after.length, JSON.stringify(after))

  // Cross-check: every customer the regex matches is now flagged.
  const missed = (await c.query('select name from customers where name ~* $1 and not is_gc', [LOOKS_LIKE_GC])).rows
  if (missed.length) {
    console.log('*** STILL UNFLAGGED:', JSON.stringify(missed.map((r) => r.name)))
    process.exit(1)
  }
  console.log('OK — column agrees with looksLikeGc() for every customer')
} finally {
  await c.end()
}
