// One-shot: re-add CRON_SECRET + SYNC_SECRET to Vercel production with the
// exact values from .env.local, no trailing whitespace (a PowerShell pipe
// had appended a newline, which Vercel rejects in HTTP header values and
// which failed the production build on 2026-07-29).
import fs from 'node:fs/promises'
import { spawnSync } from 'node:child_process'

const text = await fs.readFile('.env.local', 'utf8')
const get = (name) => {
  for (const line of text.split('\n')) {
    if (line.startsWith(name + '=')) return line.slice(name.length + 1).replace(/[\r\n\s]+$/, '')
  }
  return null
}

for (const name of ['CRON_SECRET', 'SYNC_SECRET']) {
  const value = get(name)
  if (!value) {
    console.error(`${name}: missing from .env.local`)
    process.exit(1)
  }
  const r = spawnSync('npx', ['vercel', 'env', 'add', name, 'production'], {
    input: value,
    encoding: 'utf8',
    shell: true,
  })
  const out = (r.stdout + r.stderr).trim().split('\n').pop()
  console.log(`${name} (len ${value.length}): ${out}`)
}
