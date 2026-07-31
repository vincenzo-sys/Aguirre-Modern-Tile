// Read-only probe: what can the Resend API tell us / do for inbound setup?
// Lists domains and checks which receiving-related endpoints exist.
import fs from 'node:fs/promises'

const text = await fs.readFile('.env.local', 'utf8')
for (const line of text.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '').trim()
}
const key = process.env.RESEND_API_KEY
if (!key) {
  console.error('RESEND_API_KEY missing')
  process.exit(1)
}
const H = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }

async function get(path) {
  try {
    const r = await fetch(`https://api.resend.com${path}`, { headers: H })
    const body = await r.text()
    return { status: r.status, body: body.slice(0, 700) }
  } catch (e) {
    return { status: 'ERR', body: String(e).slice(0, 200) }
  }
}

console.log('=== GET /domains ===')
const domains = await get('/domains')
console.log(domains.status, domains.body)

for (const p of ['/emails/receiving', '/receiving', '/receiving/domains', '/webhooks', '/inbound']) {
  const r = await get(p)
  console.log(`=== GET ${p} === ${r.status} ${r.body.slice(0, 250)}`)
}
