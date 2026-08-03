// Simulate the exact profile lookup (dashboard)/layout.tsx performs, as a
// given user, with RLS enforced — the definitive check for "valid password
// but bounced back to /login".
//
// Usage: node scripts/simulate-login.mjs [email]
import fs from 'node:fs/promises'
import path from 'node:path'
import pg from 'pg'

const text = await fs.readFile(path.resolve('.env.local'), 'utf8')
for (const line of text.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '').trim()
}

const only = process.argv[2]
const c = new pg.Client({ connectionString: process.env.DATABASE_URI })
await c.connect()

const { rows: users } = await c.query(
  `SELECT id, email FROM auth.users ${only ? 'WHERE lower(email) = lower($1)' : ''} ORDER BY email`,
  only ? [only] : []
)

for (const u of users) {
  await c.query('BEGIN')
  try {
    // Impersonate exactly what PostgREST does for a signed-in user.
    await c.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: u.id, role: 'authenticated' }),
    ])
    await c.query(`SET LOCAL ROLE authenticated`)

    const { rows } = await c.query(
      `SELECT id, full_name, role, is_active FROM profiles WHERE id = $1`,
      [u.id]
    )
    console.log(
      rows.length
        ? `PASS  ${u.email}  -> ${rows[0].full_name} / ${rows[0].role} / active=${rows[0].is_active}`
        : `FAIL  ${u.email}  -> RLS returned no profile; dashboard redirects to /login`
    )
  } catch (e) {
    console.log(`ERROR ${u.email}  -> ${e.message}`)
  } finally {
    await c.query('ROLLBACK')
  }
}

await c.end()
