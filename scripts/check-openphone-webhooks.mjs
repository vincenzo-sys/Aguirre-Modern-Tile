// Read-only: what webhooks does OpenPhone/Quo have configured, and which
// events do they subscribe to?
//
// Motivation: message_log has never recorded a single inbound text, which
// suggests the webhook may not be subscribed to `message.received` — in
// which case customer replies never reach the dashboard at all.
import fs from 'node:fs/promises'
import path from 'node:path'

const text = await fs.readFile(path.resolve('.env.local'), 'utf8')
for (const line of text.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '').trim()
}

// Falls back to the tile-agent's config (same OpenPhone/Quo account) when
// the dashboard's key isn't present locally — it lives in Vercel, not here.
let key = process.env.OPENPHONE_API_KEY
if (!key) {
  try {
    const cfg = JSON.parse(
      await fs.readFile('C:/Users/vince/OneDrive/Vincenzo/Agents/tile-agent/config.json', 'utf8')
    )
    key = cfg.quo_api_key || cfg.openphone_api_key
    if (key) console.log('(using tile-agent config key)\n')
  } catch {
    /* ignore */
  }
}
if (!key) {
  console.error('No OpenPhone API key found in .env.local or tile-agent/config.json')
  process.exit(1)
}
const H = { Authorization: key, 'Content-Type': 'application/json' }

async function get(p) {
  try {
    const r = await fetch(`https://api.openphone.com${p}`, { headers: H })
    return { status: r.status, body: (await r.text()).slice(0, 1500) }
  } catch (e) {
    return { status: 'ERR', body: String(e).slice(0, 200) }
  }
}

for (const p of ['/v1/webhooks', '/v1/webhooks/messages', '/v1/webhooks/calls', '/v1/phone-numbers']) {
  const r = await get(p)
  console.log(`\n=== GET ${p} -> ${r.status} ===`)
  try {
    console.log(JSON.stringify(JSON.parse(r.body), null, 2).slice(0, 1200))
  } catch {
    console.log(r.body)
  }
}
