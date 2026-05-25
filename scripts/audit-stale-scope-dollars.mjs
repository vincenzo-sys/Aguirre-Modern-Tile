// Audit every job with an estimate URL for scope_notes that embed dollar
// amounts which may now be stale vs the live estimated_cost / line items.

import fs from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const text = await fs.readFile(path.resolve('.env.local'), 'utf8')
for (const line of text.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const { data: jobs } = await sb
  .from('jobs')
  .select('id, job_number, title, scope_notes, line_items, estimated_cost, estimate_token, status')
  .not('estimate_token', 'is', null)
  .not('scope_notes', 'is', null)

let problems = 0
for (const j of jobs) {
  const issues = []

  const depMatch = j.scope_notes.match(/10%\s+deposit\s*\(\$([\d,]+(?:\.\d+)?)\)/i)
  if (depMatch && j.estimated_cost) {
    const embedded = Number(depMatch[1].replace(/,/g, ''))
    const correct = Math.round(Number(j.estimated_cost) * 0.1 * 100) / 100
    if (Math.abs(embedded - correct) >= 0.5) {
      issues.push(`  PAYMENT: embedded deposit $${embedded.toFixed(2)} != live $${correct.toFixed(2)} (delta $${(correct - embedded).toFixed(2)})`)
    }
  }

  const sectionRe = /-\s+([^:]+):.*?\(\$([\d,]+(?:\.\d+)?)\s+labor\s*\+\s*materials\)/gi
  let m
  while (true) {
    m = sectionRe.test(j.scope_notes) ? sectionRe.lastMatch : null
    break
  }
  // simpler: use matchAll
  for (const match of j.scope_notes.matchAll(/-\s+([^:]+):.*?\(\$([\d,]+(?:\.\d+)?)\s+labor\s*\+\s*materials\)/gi)) {
    const sectionName = match[1].trim()
    const embedded = Number(match[2].replace(/,/g, ''))
    const items = (j.line_items || []).filter((li) => li.section === sectionName)
    if (items.length > 0) {
      const live = items.reduce((s, i) => s + (Number(i.amount) || 0), 0)
      if (Math.abs(embedded - live) >= 0.5) {
        issues.push(`  SECTION "${sectionName}": embedded $${embedded.toFixed(2)} != live $${live.toFixed(2)} (delta $${(live - embedded).toFixed(2)})`)
      }
    } else {
      issues.push(`  SECTION "${sectionName}": embedded $${embedded.toFixed(2)} -- no matching line_items section`)
    }
  }

  if (issues.length > 0) {
    problems++
    console.log(`Job #${j.job_number} (${j.status}) -- ${j.title}`)
    console.log(`  estimated_cost: $${Number(j.estimated_cost).toFixed(2)}`)
    console.log(`  token: ${j.estimate_token}`)
    for (const i of issues) console.log(i)
    console.log()
  }
}

console.log(`========================================`)
console.log(`${problems} of ${jobs.length} jobs with estimate URLs have stale embedded $ values.`)
