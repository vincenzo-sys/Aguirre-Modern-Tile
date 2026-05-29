import fs from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const text = await fs.readFile(path.resolve('.env.local'), 'utf8')
for (const line of text.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const { data } = await sb.from('jobs').select('job_number, payment_terms_text, estimated_cost').not('estimate_token', 'is', null)

for (const j of data) {
  if (!j.payment_terms_text) continue
  const dollars = j.payment_terms_text.match(/\$[\d,]+(?:\.\d+)?/g)
  if (dollars) {
    console.log(`Job #${j.job_number}: dollars in payment_terms_text =`, dollars)
    console.log(`   text: ${j.payment_terms_text.slice(0, 200)}...`)
    console.log()
  }
}
