import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { matchCatalog } from './scopes'
import type { MaterialCatalogRow } from '@/lib/estimator'
import type { MaterialFormulaEntry } from './formulas'

// ── Template ↔ catalog contract ────────────────────────────────────────
//
// Every material a template formula asks for MUST resolve to a row in the
// materials catalog. If it doesn't, generateFromScopes silently drops the
// line (scopes.ts: `if (!row) { ...; continue }`) and the estimate total
// comes out too low with no error. That's the scariest failure mode in the
// estimator — a quote that's quietly wrong.
//
// This test loads the production backups (the same JSON the apply scripts
// write) and asserts the contract holds, so a future SKU rename in either
// the templates or the catalog turns CI red instead of surfacing only when
// an owner happens to notice a missing line on a real quote.
//
// When this fails: either a formula `item` was renamed (fix the formula) or
// a catalog `item` was renamed (fix the catalog / add the row). Keep the
// two names in sync.

const BACKUP_DIR = path.resolve(process.cwd(), 'scripts/backups')

function loadJson<T>(file: string): T {
  return JSON.parse(readFileSync(path.join(BACKUP_DIR, file), 'utf8')) as T
}

interface TemplateBackupRow {
  template_name: string
  materials_formula: MaterialFormulaEntry[] | null
}

const templates = loadJson<TemplateBackupRow[]>('job_templates_formulas_2026-07-18.json')
// matchCatalog only reads `.item`; the backup carries stringly-typed numeric
// columns, so cast through unknown rather than reshape every row.
const catalog = loadJson<Array<{ item: string }>>(
  'materials_pricing_2026-07-17.json'
) as unknown as MaterialCatalogRow[]

describe('template ↔ catalog contract', () => {
  it('loaded the backups', () => {
    expect(templates.length).toBeGreaterThan(0)
    expect(catalog.length).toBeGreaterThan(0)
  })

  // One assertion per (template, material) pair so a failure names exactly
  // which SKU broke, in which template, instead of a single opaque failure.
  const pairs: Array<{ template: string; item: string }> = []
  for (const t of templates) {
    for (const entry of t.materials_formula ?? []) {
      pairs.push({ template: t.template_name, item: entry.item })
    }
  }

  it.each(pairs)(
    'resolves "$item" for template "$template"',
    ({ item }) => {
      expect(
        matchCatalog(item, catalog),
        `Formula material "${item}" has no matching row in materials_pricing — it would be silently dropped from every estimate that uses this template.`
      ).not.toBeNull()
    }
  )
})
