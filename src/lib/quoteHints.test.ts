import { describe, it, expect } from 'vitest'
import { deriveQuoteHints, templateForJobType } from './quoteHints'

describe('deriveQuoteHints', () => {
  it('maps a small floor-only bathroom to the small floor template', () => {
    const h = deriveQuoteHints('bathroom', { size: 'small', projectScope: 'floor-only' })
    expect(h.initialTemplate).toBe('Bathroom Floor (Small)')
    expect(h.initialSqft).toBe(40)
    expect(h.initialAddons).toEqual({})
  })

  it('derives large_format from a backsplash tileStyle answer', () => {
    const h = deriveQuoteHints('backsplash', { linearFeet: 'medium', tileStyle: 'large' })
    expect(h.initialAddons.large_format).toBe(true)
  })

  it('derives large_format from a kitchen-floor tileSize answer', () => {
    const h = deriveQuoteHints('kitchen-floor', { size: 'medium', tileSize: 'pattern' })
    expect(h.initialAddons.large_format).toBe(true)
  })

  it('does not flag large_format for subway/mosaic/standard tile', () => {
    expect(deriveQuoteHints('backsplash', { tileStyle: 'subway' }).initialAddons).toEqual({})
    expect(deriveQuoteHints('backsplash', { tileStyle: 'mosaic' }).initialAddons).toEqual({})
    expect(deriveQuoteHints('kitchen-floor', { tileSize: 'standard' }).initialAddons).toEqual({})
  })

  it('returns empty hints (with initialAddons) for unknown project types', () => {
    const h = deriveQuoteHints(null, null)
    expect(h).toEqual({ initialTemplate: null, initialSqft: null, initialAddons: {} })
  })

  it('picks the walk-in large template for a large walk-in shower', () => {
    const h = deriveQuoteHints('shower', { showerType: 'walkin', size: 'large' })
    expect(h.initialTemplate).toBe('Walk-in Shower (Large)')
  })

  it('lets an exact sqft answer override the size band', () => {
    const band = deriveQuoteHints('bathroom', { size: 'small', projectScope: 'floor-only' })
    expect(band.initialSqft).toBe(40) // band midpoint
    const exact = deriveQuoteHints('bathroom', { size: 'small', projectScope: 'floor-only', exactSqft: '52' })
    expect(exact.initialSqft).toBe(52)
  })

  it('converts an exact backsplash linear-feet answer to sqft (×1.5)', () => {
    const h = deriveQuoteHints('backsplash', { linearFeet: 'small', exactLinearFeet: '14' })
    expect(h.initialSqft).toBe(21)
  })

  it('ignores blank/zero exact measurements (keeps the band)', () => {
    const h = deriveQuoteHints('kitchen-floor', { size: 'medium', exactSqft: '' })
    expect(h.initialSqft).toBe(150)
  })
})

describe('templateForJobType', () => {
  it('matches on substrings', () => {
    expect(templateForJobType('Backsplash Install')).toBe('Backsplash (Standard)')
    expect(templateForJobType('Shower Tile')).toBe('Walk-in Shower (Small)')
    expect(templateForJobType('Floor Tile')).toBe('Bathroom Floor (Medium)')
    expect(templateForJobType('Bathroom Remodel')).toBe('Tub Surround + Bathroom Floor')
  })

  it('returns null when nothing matches', () => {
    expect(templateForJobType('Custom Mosaic Art')).toBeNull()
    expect(templateForJobType(null)).toBeNull()
  })
})
