// One-off helper: mint a magic link for the dev user so I can authenticate
// the browser session without knowing the password. Uses the service role
// key which already lives in .env.local for other dashboard scripts.
import fs from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const text = await fs.readFile(path.resolve('.env.local'), 'utf8')
for (const line of text.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

const email = process.argv[2] ?? 'vincenzo@pembertonholdingsllc.com'

const { data, error } = await supabase.auth.admin.generateLink({
  type: 'magiclink',
  email,
  options: { redirectTo: 'http://localhost:3100/auth/callback' },
})

if (error) {
  console.error('generateLink error:', error)
  process.exit(1)
}

const link = data?.properties?.action_link
if (!link) {
  console.error('no action_link in response:', JSON.stringify(data, null, 2))
  process.exit(1)
}

console.log(link)
