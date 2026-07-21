import { describe, it, expect } from 'vitest'
import { computeFormula, computeMaterialQty, computeLaborDays, appliesWhen } from './formulas'

describe('computeFormula — coverage variable', () => {
  it('exposes coverage so bag counts can derive from the catalog', () => {
    // 80 sqft floor, 15% waste, 65 sqft/bag coverage → ceil(80*1.15/65) = 2
    expect(computeFormula('ceil(sqft * 1.15 / coverage)', { sqft: 80, coverage: 65 })).toBe(2)
    // Same formula, coverage bumped to 100 → fewer bags
    expect(computeFormula('ceil(sqft * 1.15 / coverage)', { sqft: 80, coverage: 100 })).toBe(1)
  })

  it('leaves coverage-free formulas completely unaffected (refactor is additive)', () => {
    expect(computeFormula('ceil(sqft / 50)', { sqft: 18 })).toBe(1)
    expect(computeFormula('ceil(sub_sqft.walls / 12)', { sub_sqft: { walls: 80 } })).toBe(7)
  })

  it('fails loud when a coverage-based formula has no matched material (coverage 0 → Infinity)', () => {
    expect(() => computeFormula('ceil(sqft / coverage)', { sqft: 50, coverage: 0 })).toThrow()
  })
})

describe('computeMaterialQty — clamps still apply with coverage formulas', () => {
  it('respects the min floor', () => {
    expect(
      computeMaterialQty({ formula: 'ceil(sqft * 1.1 / coverage)', vars: { sqft: 5, coverage: 65 }, min: 1 }),
    ).toBe(1)
  })
  it('respects the max ceiling', () => {
    expect(
      computeMaterialQty({ formula: 'ceil(sqft * 1.1 / coverage)', vars: { sqft: 5000, coverage: 65 }, max: 6 }),
    ).toBe(6)
  })
})

describe('computeLaborDays — rounds to half-days and clamps', () => {
  it('rounds to the nearest half day', () => {
    // 130 sqft / 50 = 2.6 → nearest half = 2.5
    expect(computeLaborDays({ formula: 'sqft / 50', vars: { sqft: 130 } })).toBe(2.5)
  })
  it('floors at min so a tiny scope still quotes a crew showing up', () => {
    expect(computeLaborDays({ formula: 'sqft / 50', vars: { sqft: 20 }, min: 2 })).toBe(2)
  })
  it('caps at max so an absurd sqft cannot produce runaway labor', () => {
    // 5000 / 50 = 100 days, clamped to 6
    expect(computeLaborDays({ formula: 'sqft / 50', vars: { sqft: 5000 }, min: 2, max: 6 })).toBe(6)
  })
})

describe('appliesWhen — addon gating used by the cement-board-floor option', () => {
  it('includes when the addon is on, and the negated entry when off', () => {
    expect(appliesWhen('cement_board_floor', { cement_board_floor: true })).toBe(true)
    expect(appliesWhen('!cement_board_floor', { cement_board_floor: true })).toBe(false)
    expect(appliesWhen('cement_board_floor', {})).toBe(false)
    expect(appliesWhen('!cement_board_floor', {})).toBe(true)
  })
})
