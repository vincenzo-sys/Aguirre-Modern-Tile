// Create the OpenPhone/Quo webhooks that feed the dashboard Inbox.
//
// Why this exists: GET /v1/webhooks returned an empty list — no webhook was
// ever registered, so `message.received` and `call.completed` never fired and
// message_log recorded zero inbound texts. The endpoint existed in code the
// whole time; OpenPhone was simply never told to call it.
//
// SAFETY: this OpenPhone account is shared with other businesses (Airport
// Parking Boston, Broadway Motors). Webhooks are scoped with resourceIds to
// the tile phone number ONLY — never '*' — so other businesses' customer
// messages are never delivered to this dashboard.
//
// Usage:
//   node scripts/setup-openphone-webhooks.mjs           (dry run — shows plan)
//   node scripts/setup-openphone-webhooks.mjs --create   (actually creates)
import fs from 'node:fs/promises'
import path from 'node:path'

const TILE_NUMBER = '+16177661259'
const WEBHOOK_URL = 'https://www.aguirremoderntile.com/api/openphone/webhook'
const CREATE = process.argv.includes('--create')

const text = await fs.readFile(path.resolve('.env.local'), 'utf8')
for (const line of text.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '').trim()
}
let key = process.env.OPENPHONE_API_KEY
if (!key) {
  const cfg = JSON.parse(
    await fs.readFile('C:/Users/vince/OneDrive/Vincenzo/Agents/tile-agent/config.json', 'utf8')
  )
  key = cfg.quo_api_key || cfg.openphone_api_key
}
if (!key) {
  console.error('No OpenPhone API key available')
  process.exit(1)
}
const H = { Authorization: key, 'Content-Type': 'application/json' }

// 1. Resolve the tile phone number to its PN id — never assume.
const numsRes = await fetch('https://api.openphone.com/v1/phone-numbers', { headers: H })
const nums = (await numsRes.json()).data ?? []
console.log('Phone numbers on this account:')
for (const n of nums) console.log(`  ${n.id}  ${n.number}  ${n.name}`)

const tile = nums.find((n) => n.number === TILE_NUMBER)
if (!tile) {
  console.error(`\nTile number ${TILE_NUMBER} not found — aborting.`)
  process.exit(1)
}
console.log(`\nScoping webhooks to: ${tile.id} (${tile.number} — ${tile.name}) ONLY`)

const plan = [
  {
    what: 'messages',
    path: '/v1/webhooks/messages',
    body: {
      url: WEBHOOK_URL,
      events: ['message.received'],
      resourceIds: [tile.id],
      label: 'Aguirre dashboard Inbox - inbound texts',
      status: 'enabled',
    },
  },
  {
    what: 'calls',
    path: '/v1/webhooks/calls',
    body: {
      url: WEBHOOK_URL,
      events: ['call.completed'],
      resourceIds: [tile.id],
      label: 'Aguirre dashboard Inbox - completed calls',
      status: 'enabled',
    },
  },
]

if (!CREATE) {
  console.log('\n--- DRY RUN (pass --create to apply) ---')
  for (const p of plan) console.log(`POST ${p.path}\n${JSON.stringify(p.body, null, 2)}`)
  process.exit(0)
}

const keys = []
for (const p of plan) {
  const r = await fetch(`https://api.openphone.com${p.path}`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify(p.body),
  })
  const body = await r.json().catch(() => ({}))
  if (r.status === 200 || r.status === 201) {
    const d = body.data || body
    console.log(`\n${p.what}: CREATED id=${d.id} events=${JSON.stringify(d.events)} scope=${JSON.stringify(d.resourceIds)}`)
    if (d.key) keys.push({ what: p.what, id: d.id, key: d.key })
  } else {
    console.error(`\n${p.what}: FAILED ${r.status} ${JSON.stringify(body).slice(0, 400)}`)
  }
}

console.log('\n=== signing keys ===')
for (const k of keys) console.log(`${k.what}  ${k.id}  ${k.key}`)
console.log(
  keys.length && keys.every((k) => k.key === keys[0].key)
    ? '\nBoth webhooks share one key — set OPENPHONE_WEBHOOK_SECRET to it.'
    : '\nKeys DIFFER — OPENPHONE_WEBHOOK_SECRET must accept a comma-separated list.'
)
