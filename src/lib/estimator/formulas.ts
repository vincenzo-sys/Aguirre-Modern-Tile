// Formula DSL for template material/labor quantities.
//
// Why this exists: hardcoded quantities in TEMPLATE_MATERIALS don't scale with
// project size — "Walk-in Shower" was always 10 sheets of GoBoard regardless of
// whether the shower was 50 sqft or 200 sqft. Formulas like `ceil(sqft / 15)`
// let templates derive realistic quantities from the actual scope.
//
// Why a sandboxed parser instead of dynamic-code execution: formulas are
// stored in the DB and could in principle be edited via the settings UI
// someday. expr-eval gives us a parser that can't escape into the JS runtime.
// We further restrict the parser to arithmetic + a small whitelist of math
// functions.
//
// Failure mode: a bad formula throws (caught by the caller in
// src/lib/estimator/scopes.ts and surfaced to the user). We intentionally
// fail loud — the Dorothy incident on 2026-04-22 (auto-generated estimate
// silently produced wrong numbers) taught us that silent fallbacks are worse
// than visible errors when money is involved.

import { Parser } from 'expr-eval'

export interface FormulaVars {
  sqft?: number
  linear_ft?: number
  height_ft?: number
  addons?: Record<string, boolean | number>
  // Per-template sub-area sqft. For walk-in showers: { walls, shower_floor,
  // outside_floor }; for tub combos: { walls, floor }; for simple templates:
  // empty/absent. Formulas reference values via `sub_sqft.<key>`.
  sub_sqft?: Record<string, number>
}

// Locked-down parser. Disable assignment, comparisons, conditionals, and any
// operator that could produce non-numeric results or have side effects. What
// remains: + - * / ^ (power), parentheses, and the function whitelist.
function makeParser(): Parser {
  const parser = new Parser({
    operators: {
      add: true,
      subtract: true,
      multiply: true,
      divide: true,
      power: true,
      remainder: true,
      // Negation handled by subtract on unary minus.
      // Disable everything that doesn't return a number cleanly.
      logical: false,
      comparison: false,
      conditional: false,
      in: false,
      assignment: false,
    },
  })
  // expr-eval splits its built-ins across two maps:
  //   - unaryOps: sin, cos, tan, sqrt, log, ceil, floor, round, abs, exp, ...
  //   - functions: min, max, random, fac, hypot, pow, atan2, if, ...
  //
  // We want a tight whitelist for tile-quantity math. Anything outside the
  // whitelist throws when used — failing loud beats a typo'd `sin(sqft)`
  // silently producing -0.99 sheets of GoBoard.
  const allowedUnary = new Set(['ceil', 'floor', 'round', 'abs', '-', '+'])
  const allowedFunctions = new Set(['min', 'max'])

  for (const op of Object.keys(parser.unaryOps)) {
    if (!allowedUnary.has(op)) {
      const opName = op
      parser.unaryOps[op] = () => {
        throw new Error(`Operator "${opName}" is not allowed in template formulas`)
      }
    }
  }
  for (const fn of Object.keys(parser.functions)) {
    if (!allowedFunctions.has(fn)) {
      const fnName = fn
      parser.functions[fn] = () => {
        throw new Error(`Function "${fnName}" is not allowed in template formulas`)
      }
    }
  }
  return parser
}

const parser = makeParser()

// expr-eval's typings narrow Value too aggressively (no nested objects), but
// the runtime supports `.` member access just fine, so we hand it a plain
// object and assert the type at the call site.
function buildScope(vars: FormulaVars): Record<string, unknown> {
  const scope: Record<string, unknown> = {
    sqft: Number(vars.sqft ?? 0),
    linear_ft: Number(vars.linear_ft ?? 0),
    height_ft: Number(vars.height_ft ?? 0),
  }
  // Addons land as a nested object so formulas can write `addons.niche`.
  // Booleans coerce to 1/0 so they multiply cleanly: e.g. `2 + 1*addons.niche`.
  const addons: Record<string, number> = {}
  if (vars.addons) {
    for (const [k, v] of Object.entries(vars.addons)) {
      addons[k] = typeof v === 'boolean' ? (v ? 1 : 0) : Number(v) || 0
    }
  }
  scope.addons = addons
  // Sub-area sqft (e.g. walls / shower_floor / outside_floor for showers)
  // exposed as `sub_sqft.<key>` in formulas. The caller (scopes.ts) is
  // responsible for filling every key declared in the template's
  // sub_areas; missing keys here would resolve to undefined and propagate
  // NaN through the formula — which is the loud-failure mode we want for
  // typos like `sub_sqft.outsie_floor`.
  const subSqft: Record<string, number> = {}
  if (vars.sub_sqft) {
    for (const [k, v] of Object.entries(vars.sub_sqft)) {
      subSqft[k] = Number(v) || 0
    }
  }
  scope.sub_sqft = subSqft
  return scope
}

export function computeFormula(expr: string, vars: FormulaVars): number {
  const trimmed = expr?.trim()
  if (!trimmed) {
    throw new Error('Empty formula')
  }
  let parsed
  try {
    parsed = parser.parse(trimmed)
  } catch (err) {
    throw new Error(
      `Could not parse formula "${expr}": ${err instanceof Error ? err.message : String(err)}`
    )
  }
  let result: unknown
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result = parsed.evaluate(buildScope(vars) as any)
  } catch (err) {
    throw new Error(
      `Formula "${expr}" failed to compute: ${err instanceof Error ? err.message : String(err)}`
    )
  }
  if (typeof result !== 'number' || !Number.isFinite(result)) {
    throw new Error(`Formula "${expr}" did not produce a finite number (got ${String(result)})`)
  }
  return result
}

export interface MaterialQtyOpts {
  formula: string
  vars: FormulaVars
  min?: number
  max?: number
}

// Materials always round up — you can't buy 1.3 sheets of GoBoard. Then we
// clamp to a [min, max] window so a tiny sqft can't produce zero materials
// (the min floor catches "0 sheets of backer board for a 5 sqft shower"
// regression) and an absurd sqft can't accidentally order 100 sheets.
export function computeMaterialQty(opts: MaterialQtyOpts): number {
  const raw = computeFormula(opts.formula, opts.vars)
  let qty = Math.ceil(raw)
  if (opts.min !== undefined && opts.min !== null) qty = Math.max(qty, opts.min)
  if (opts.max !== undefined && opts.max !== null) qty = Math.min(qty, opts.max)
  return qty
}

export interface LaborDaysOpts {
  formula: string
  vars: FormulaVars
  min?: number
}

// Labor days round to the nearest half day (we don't quote 0.37 days), then
// floor at the per-template min so we always quote at least one crew showing
// up regardless of how small the scope is.
export function computeLaborDays(opts: LaborDaysOpts): number {
  const raw = computeFormula(opts.formula, opts.vars)
  let days = Math.round(raw * 2) / 2
  if (opts.min !== undefined && opts.min !== null) days = Math.max(days, opts.min)
  return days
}

// ── Schemas for the JSONB columns added in migration 021 ────────────────

export interface MaterialFormulaEntry {
  item: string
  formula: string
  min?: number
  max?: number
  applies_when?: string  // reserved for future conditional inclusion (e.g. only on wet areas)
}

export interface LaborFormula {
  demo_days?: string
  install_days?: string
  min_demo?: number
  min_install?: number
}
