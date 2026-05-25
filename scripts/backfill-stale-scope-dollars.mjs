// Strip the two stale-dollar patterns from scope_notes across every job:
//   1. " ($X,XXX.XX labor + materials)" appended to per-section bullets
//   2. " ($X.XX)" inside the "10% deposit (...)" payment terms line
//
// The renderer scrubs these too (belt-and-suspenders), but cleaning the
// stored text means the dashboard scope editor + any downstream consumers
// (Notion sync, future PDF export) all see clean data.

import fs from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const text = await fs.readFile(path.resolve('.env.local'), 'utf8')
for (const line of text.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const SECTION_DOLLAR_RE = /\s*\(\$[\d,]+(?:\.\d+)?\s+labor\s*\+\s*materials\)/gi
const DEPOSIT_DOLLAR_RE = /(10%\s+deposit)\s*\(\$[\d,]+(?:\.\d+)?\)/gi

function scrub(notes) {
  if (!notes) return { text: notes, sectionHits: 0, depositHits: 0 }
  const sectionHits = (notes.match(SECTION_DOLLAR_RE) || []).length
  const depositHits = (notes.match(DEPOSIT_DOLLAR_RE) || []).length
  const cleaned = notes
    .replace(SECTION_DOLLAR_RE, '')
    .replace(DEPOSIT_DOLLAR_RE, '$1')
  return { text: cleaned, sectionHits, depositHits }
}

const { data: jobs } = await sb
  .from('jobs')
  .select('id, job_number, title, scope_notes')
  .not('scope_notes', 'is', null)

let touched = 0
for (const j of jobs) {
  const { text: cleaned, sectionHits, depositHits } = scrub(j.scope_notes)
  if (sectionHits === 0 && depositHits === 0) continue
  if (cleaned === j.scope_notes) continue

  const { error } = await sb.from('jobs').update({ scope_notes: cleaned }).eq('id', j.id)
  if (error) {
    console.log(`Job #${j.job_number}: UPDATE FAILED -- ${error.message}`)
    continue
  }
  touched++
  console.log(`Job #${j.job_number} (${j.title}): scrubbed ${sectionHits} section-$, ${depositHits} deposit-$`)
}

console.log(`========================================`)
console.log(`${touched} jobs updated.`)
