// One-shot migration runner. Reads DATABASE_URI from .env.local, executes a
// SQL file as a single transaction, prints the result, and exits.
//
// Usage:  node scripts/run-migration.mjs supabase/migrations/021_template_formulas_and_scopes.sql

import fs from 'node:fs/promises'
import path from 'node:path'
import pg from 'pg'

async function loadEnv() {
  const envPath = path.resolve('.env.local')
  const text = await fs.readFile(envPath, 'utf8')
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m) {
      const [, k, v] = m
      if (!process.env[k]) process.env[k] = v.replace(/^"|"$/g, '')
    }
  }
}

async function main() {
  await loadEnv()
  const connStr = process.env.DATABASE_URI || process.env.DATABASE_URL
  if (!connStr) {
    console.error('Missing DATABASE_URI in .env.local')
    process.exit(1)
  }

  const file = process.argv[2]
  if (!file) {
    console.error('Usage: node scripts/run-migration.mjs <path-to-sql>')
    process.exit(1)
  }
  const sql = await fs.readFile(file, 'utf8')

  const client = new pg.Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } })
  await client.connect()
  try {
    await client.query('BEGIN')
    const result = await client.query(sql)
    await client.query('COMMIT')
    const rowCounts = Array.isArray(result) ? result.map((r) => r.rowCount).join(', ') : result.rowCount
    console.log(`OK: ${path.basename(file)} (rowCount: ${rowCounts})`)
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    console.error(`FAIL: ${path.basename(file)}`)
    console.error(err.message)
    process.exit(1)
  } finally {
    await client.end()
  }
}

main()
