// Read-only: every outbound message this app has sent, and the team phone
// numbers on file — to determine whether a given recurring text originates
// here or from another system.
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

console.log('=== every outbound message_log row ===')
const { rows } = await c.query(
  `SELECT created_at, phone_number, trigger_type, left(message, 55) AS preview
     FROM message_log WHERE direction = 'outbound' ORDER BY created_at DESC LIMIT 30`
)
for (const r of rows) {
  console.log(`${r.created_at.toISOString().slice(0, 16)}  ${r.phone_number}  ${r.trigger_type}  "${r.preview}"`)
}
if (!rows.length) console.log('(none)')

console.log('\n=== team members on file (profiles) ===')
const { rows: profiles } = await c.query(
  `SELECT full_name, email, role, phone FROM profiles ORDER BY role, full_name`
)
for (const p of profiles) {
  console.log(`${(p.full_name || '?').padEnd(22)} ${(p.role || '').padEnd(8)} ${p.phone || '(no phone)'}  ${p.email || ''}`)
}

await c.end()
