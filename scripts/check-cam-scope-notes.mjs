import fs from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const text = await fs.readFile(path.resolve('.env.local'), 'utf8')
for (const line of text.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const { data } = await sb.from('jobs').select('scope_notes').eq('id', '415a8956-0d9b-47f3-90f2-c428406c2d44').single()
const matches = data.scope_notes.match(/\$[\d,]+\.?\d*|\d+\.\d+%|10% deposit/g) || []
console.log('Money mentions:', matches)
console.log()
console.log('--- scope_notes ---')
console.log(data.scope_notes)
