// End-to-end check of the inbound email pipeline: send a message to the
// receiving address, then watch email_log for the row the webhook writes.
//
// Proves the whole chain — MX -> Resend inbound -> svix-verified webhook ->
// body fetch -> email_log -> Inbox.
//
// Usage: node scripts/test-inbound-email.mjs
import fs from 'node:fs/promises'
import path from 'node:path'
import pg from 'pg'

const text = await fs.readFile(path.resolve('.env.local'), 'utf8')
for (const line of text.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '').trim()
}

const TO = process.env.INBOUND_REPLY_EMAIL || 'reply@aguirremoderntile.com'
const FROM = 'Aguirre Modern Tile <noreply@aguirremoderntile.com>'
const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19)
const subject = `Inbox pipeline test ${stamp}`

const before = new Date().toISOString()

const send = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    from: FROM,
    to: [TO],
    subject,
    text: 'This is an automated test of the dashboard Inbox email pipeline. Safe to ignore.',
  }),
})
const sendBody = await send.json()
console.log('send ->', send.status, JSON.stringify(sendBody).slice(0, 160))
if (!send.ok) process.exit(1)

const c = new pg.Client({ connectionString: process.env.DATABASE_URI })
await c.connect()

let found = null
for (let i = 1; i <= 20; i++) {
  await new Promise((r) => setTimeout(r, 6000))
  const { rows } = await c.query(
    `SELECT id, direction, from_email, to_email, subject,
            left(coalesce(body_text, body_html, ''), 60) AS body_preview,
            read_at, created_at
       FROM email_log
      WHERE created_at >= $1
      ORDER BY created_at DESC LIMIT 1`,
    [before]
  )
  if (rows.length) {
    found = rows[0]
    console.log(`\nARRIVED after ~${i * 6}s:`)
    console.log(JSON.stringify(found, null, 2))
    break
  }
  process.stdout.write(`waiting ${i * 6}s... `)
}

if (!found) {
  console.log('\n\nNo email_log row yet. Check Resend > Webhooks > the endpoint for delivery attempts.')
}
await c.end()
process.exit(found ? 0 : 2)
