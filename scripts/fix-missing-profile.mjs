// Repair a dashboard account that authenticates but bounces back to /login.
//
// (dashboard)/layout.tsx redirects to /login when there is no `profiles` row
// for the signed-in auth user — so valid credentials look like a broken
// password. This creates the missing profile.
//
// Usage:
//   node scripts/fix-missing-profile.mjs                 (report only)
//   node scripts/fix-missing-profile.mjs <email> --fix    (create the profile)
import fs from 'node:fs/promises'
import path from 'node:path'
import pg from 'pg'

const text = await fs.readFile(path.resolve('.env.local'), 'utf8')
for (const line of text.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '').trim()
}

const email = process.argv[2]
const FIX = process.argv.includes('--fix')

const c = new pg.Client({ connectionString: process.env.DATABASE_URI })
await c.connect()

const { rows: orphans } = await c.query(`
  SELECT u.id, u.email, u.created_at
    FROM auth.users u
    LEFT JOIN profiles p ON p.id = u.id
   WHERE p.id IS NULL
   ORDER BY u.created_at
`)

if (!orphans.length) {
  console.log('No auth users are missing a profile — every account can reach the dashboard.')
  await c.end()
  process.exit(0)
}

console.log('Auth users with NO profile (these bounce back to /login):')
for (const o of orphans) console.log(`  ${o.email}  id=${o.id}`)

if (!FIX) {
  console.log('\nRe-run with: node scripts/fix-missing-profile.mjs <email> --fix')
  await c.end()
  process.exit(0)
}

const target = orphans.find((o) => o.email?.toLowerCase() === (email || '').toLowerCase())
if (!target) {
  console.error(`\n"${email}" is not in the orphan list above — nothing done.`)
  await c.end()
  process.exit(1)
}

const fullName = target.email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())
const { rows: created } = await c.query(
  `INSERT INTO profiles (id, email, full_name, role, is_active)
   VALUES ($1, $2, $3, 'owner', true)
   RETURNING id, email, full_name, role, is_active`,
  [target.id, target.email, fullName]
)
console.log('\nCreated profile:', JSON.stringify(created[0], null, 2))
console.log('This account can now reach the dashboard.')

await c.end()
