// Audit every materials_pricing.retail_link — fetch each URL with HEAD,
// fall back to GET if HEAD is rejected, classify each as ok / redirected /
// 4xx / 5xx / network-error / missing. Read-only — no DB writes.

import fs from 'node:fs/promises'
import path from 'node:path'
import pg from 'pg'

const text = await fs.readFile(path.resolve('.env.local'), 'utf8')
for (const line of text.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

const c = new pg.Client({ connectionString: process.env.DATABASE_URI })
await c.connect()
const { rows } = await c.query(
  `SELECT id, item, category, retail_link
   FROM materials_pricing
   ORDER BY category, item`
)
await c.end()

console.log(`Auditing ${rows.length} materials in catalog…\n`)

async function check(url) {
  // Some retailers (Home Depot, Lowes) reject HEAD or aggressively block bots.
  // Send a browser-like UA and try HEAD first; if blocked, fall back to GET
  // with a short timeout. We're only looking for status codes here.
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,*/*',
  }
  for (const method of ['HEAD', 'GET']) {
    try {
      const ac = new AbortController()
      const t = setTimeout(() => ac.abort(), 12_000)
      const res = await fetch(url, {
        method,
        headers,
        redirect: 'follow',
        signal: ac.signal,
      })
      clearTimeout(t)
      // For GET we don't need to consume the body for status info.
      if (method === 'GET') {
        try { await res.body?.cancel() } catch {}
      }
      return { status: res.status, finalUrl: res.url, method }
    } catch (err) {
      if (method === 'GET') {
        return { status: 0, error: err.message, method }
      }
      // else fall through to GET
    }
  }
}

const buckets = { ok: [], redirected: [], client: [], server: [], network: [], missing: [] }
let i = 0
for (const r of rows) {
  i++
  const tag = `[${i}/${rows.length}] ${r.item}`
  if (!r.retail_link) {
    buckets.missing.push(r)
    console.log(`${tag}\n  — no retail_link set`)
    continue
  }
  const result = await check(r.retail_link)
  const finalUrl = result.finalUrl ?? r.retail_link
  const redirected = result.finalUrl && result.finalUrl !== r.retail_link
  if (result.status === 0) {
    buckets.network.push({ ...r, ...result })
    console.log(`${tag}\n  ✗ network error: ${result.error}`)
  } else if (result.status >= 500) {
    buckets.server.push({ ...r, ...result })
    console.log(`${tag}\n  ✗ ${result.status} server error`)
  } else if (result.status >= 400) {
    buckets.client.push({ ...r, ...result })
    console.log(`${tag}\n  ✗ ${result.status} ${redirected ? '→ ' + finalUrl : ''}`)
  } else if (redirected) {
    buckets.redirected.push({ ...r, ...result })
    console.log(`${tag}\n  ↪ ${result.status} → ${finalUrl}`)
  } else {
    buckets.ok.push({ ...r, ...result })
    console.log(`${tag}\n  ✓ ${result.status}`)
  }
}

console.log('\n──── Summary ────')
console.log(`OK:         ${buckets.ok.length}`)
console.log(`Redirected: ${buckets.redirected.length}`)
console.log(`4xx:        ${buckets.client.length}`)
console.log(`5xx:        ${buckets.server.length}`)
console.log(`Network:    ${buckets.network.length}`)
console.log(`Missing:    ${buckets.missing.length}`)

if (buckets.client.length || buckets.server.length || buckets.network.length || buckets.missing.length) {
  console.log('\n── Items needing attention ──')
  for (const b of [...buckets.client, ...buckets.server, ...buckets.network, ...buckets.missing]) {
    console.log(`  • ${b.item} [${b.category}] — ${b.status ?? 'no link'} ${b.retail_link ?? ''}`)
  }
}
