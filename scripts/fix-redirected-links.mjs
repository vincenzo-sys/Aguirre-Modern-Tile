// Update materials_pricing rows whose retail_link 200's via redirect — write
// the final URL back so future clicks are 1-hop and we don't depend on the
// retailer keeping redirects forever. Re-runs the audit logic on each row
// and only writes when the final URL differs.

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
  `SELECT id, item, retail_link
   FROM materials_pricing
   WHERE retail_link IS NOT NULL AND retail_link <> ''`
)

const headers = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,*/*',
}

let updated = 0
for (const r of rows) {
  try {
    const ac = new AbortController()
    const t = setTimeout(() => ac.abort(), 12_000)
    const res = await fetch(r.retail_link, { method: 'HEAD', headers, redirect: 'follow', signal: ac.signal })
    clearTimeout(t)
    if (res.status >= 200 && res.status < 300 && res.url && res.url !== r.retail_link) {
      await c.query('UPDATE materials_pricing SET retail_link = $1 WHERE id = $2', [res.url, r.id])
      console.log(`✓ ${r.item}\n    ${r.retail_link}\n  → ${res.url}`)
      updated++
    }
  } catch {
    // Skip on network errors — the audit script catches those separately.
  }
}

console.log(`\nUpdated ${updated} retail_link rows.`)
await c.end()
