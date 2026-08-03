// Generate a one-time sign-in / password-recovery link for a dashboard
// account, using the Supabase service role. Useful when the account is
// provably valid (profile + RLS both fine) but the password is unknown.
//
// The link is single-use and short-lived. Opening it signs the account in and
// lets a new password be set.
//
// Usage: node scripts/make-login-link.mjs <email> [recovery|magiclink]
import fs from 'node:fs/promises'
import path from 'node:path'

const text = await fs.readFile(path.resolve('.env.local'), 'utf8')
for (const line of text.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '').trim()
}

const email = process.argv[2]
const type = process.argv[3] || 'recovery'
if (!email) {
  console.error('Usage: node scripts/make-login-link.mjs <email> [recovery|magiclink]')
  process.exit(1)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.aguirremoderntile.com'
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const res = await fetch(`${url}/auth/v1/admin/generate_link`, {
  method: 'POST',
  headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ type, email, options: { redirect_to: `${site}/dashboard` } }),
})
const body = await res.json()
if (!res.ok) {
  console.error(`Failed (${res.status}):`, JSON.stringify(body).slice(0, 300))
  process.exit(1)
}
console.log(`\nOne-time ${type} link for ${email}:\n`)
console.log(body.properties?.action_link || body.action_link)
console.log('\nSingle use. Open it to sign in and set a new password.')
