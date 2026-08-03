// The dashboard reads `profiles` with the USER's session (not the service
// key), so Row Level Security applies. If a policy stops someone reading
// their own row, the layout sees no profile and bounces them to /login —
// looking exactly like a bad password even though the row exists.
//
// Prints the policies plus the helper functions they depend on.
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

const { rows: rls } = await c.query(
  `SELECT relrowsecurity FROM pg_class WHERE relname = 'profiles'`
)
console.log('profiles RLS enabled:', rls[0]?.relrowsecurity)

const { rows: policies } = await c.query(
  `SELECT policyname, cmd, roles::text, qual, with_check
     FROM pg_policies WHERE tablename = 'profiles' ORDER BY policyname`
)
console.log('\n=== policies on profiles ===')
for (const p of policies) {
  console.log(`\n${p.policyname}  [${p.cmd}]  roles=${p.roles}`)
  console.log(`  USING: ${p.qual}`)
  if (p.with_check) console.log(`  CHECK: ${p.with_check}`)
}
if (!policies.length) console.log('(none — with RLS on, that denies everything to non-service clients)')

console.log('\n=== helper functions referenced by policies ===')
const { rows: fns } = await c.query(
  `SELECT proname, pg_get_functiondef(oid) AS def
     FROM pg_proc WHERE proname IN ('is_team_member','is_owner','is_active_user')`
)
for (const f of fns) console.log(`\n${f.proname}:\n${f.def}`)

await c.end()
