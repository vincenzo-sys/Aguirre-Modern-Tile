// Read-only: how much traffic is actually flowing into the Inbox, and how
// much of it is still waiting on someone.
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

const q = async (label, sql) => {
  const { rows } = await c.query(sql)
  console.log(label.padEnd(34), JSON.stringify(rows[0]))
}

await q('message_log (SMS)', `SELECT count(*) total,
  count(*) FILTER (WHERE direction='inbound') inbound,
  count(*) FILTER (WHERE direction='inbound' AND read_at IS NULL) unread FROM message_log`)
await q('call_log (calls)', `SELECT count(*) total,
  count(*) FILTER (WHERE direction='inbound') inbound,
  count(*) FILTER (WHERE direction='inbound' AND read_at IS NULL) unread FROM call_log`)
await q('email_log (email)', `SELECT count(*) total,
  count(*) FILTER (WHERE direction='inbound') inbound,
  count(*) FILTER (WHERE direction='inbound' AND read_at IS NULL) unread FROM email_log`)
await q('open quote_requests', `SELECT count(*) total,
  count(*) FILTER (WHERE status='new') new FROM quote_requests
  WHERE status IN ('new','reviewed') AND converted_job_id IS NULL`)
await q('most recent inbound SMS', `SELECT max(created_at) latest FROM message_log WHERE direction='inbound'`)

await c.end()
