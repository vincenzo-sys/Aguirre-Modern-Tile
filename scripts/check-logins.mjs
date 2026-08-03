// Read-only diagnostic for dashboard sign-in problems.
//
// A working login needs THREE things lined up:
//   1. a row in auth.users (the credential)
//   2. a row in profiles with the SAME id (the role/permissions)
//   3. profiles.is_active = true
// A missing or mismatched profile is the usual cause of "it logs in and
// then bounces me back to the login page".
import fs from 'node:fs/promises'
import path from 'node:path'
import pg from 'pg'

const text = await fs.readFile(path.resolve('.env.local'), 'utf8')
for (const line of text.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '').trim()
}

const c = new pg.Client({ connectionString: process.env.DATABASE_URI })
await c.connect()

const { rows } = await c.query(`
  SELECT u.email,
         u.id                        AS auth_id,
         u.email_confirmed_at IS NOT NULL AS email_confirmed,
         u.last_sign_in_at,
         u.created_at                AS auth_created,
         (u.encrypted_password IS NOT NULL AND u.encrypted_password <> '') AS has_password,
         p.id                        AS profile_id,
         p.full_name, p.role, p.is_active
    FROM auth.users u
    FULL OUTER JOIN profiles p ON p.id = u.id
   ORDER BY u.created_at NULLS LAST
`)

for (const r of rows) {
  console.log(`\n${r.email ?? '(no auth user)'}`)
  console.log(`  auth user      : ${r.auth_id ? 'yes' : 'NO — cannot sign in'}`)
  console.log(`  password set   : ${r.has_password === null ? 'n/a' : r.has_password}`)
  console.log(`  email confirmed: ${r.email_confirmed ?? 'n/a'}`)
  console.log(`  last sign in   : ${r.last_sign_in_at ?? 'NEVER'}`)
  console.log(`  profile linked : ${r.profile_id ? 'yes' : 'NO — will bounce back to /login'}`)
  console.log(`  name/role      : ${r.full_name ?? '?'} / ${r.role ?? '?'}`)
  console.log(`  is_active      : ${r.is_active}`)
}

await c.end()
