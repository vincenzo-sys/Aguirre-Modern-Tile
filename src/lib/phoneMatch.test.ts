import { describe, it, expect } from 'vitest'
import { last10, buildPhoneOrFilter, pickPhoneMatch } from './phoneMatch'

describe('last10', () => {
  it('extracts digits from a formatted US number', () => {
    expect(last10('(617) 555-1234')).toBe('6175551234')
  })

  it('drops the country code from E.164', () => {
    expect(last10('+16175551234')).toBe('6175551234')
  })

  it('passes through a bare 10-digit number', () => {
    expect(last10('6175551234')).toBe('6175551234')
  })

  it('handles dotted and dashed formats', () => {
    expect(last10('617.555.1234')).toBe('6175551234')
    expect(last10('617-555-1234')).toBe('6175551234')
  })

  it('returns null when there are fewer than 10 digits', () => {
    expect(last10('555-1234')).toBeNull()
    expect(last10('')).toBeNull()
    expect(last10('call me maybe')).toBeNull()
  })

  it('returns null for null/undefined', () => {
    expect(last10(null)).toBeNull()
    expect(last10(undefined)).toBeNull()
  })
})

describe('buildPhoneOrFilter', () => {
  it('builds an eq + like filter on the last 10 digits', () => {
    expect(buildPhoneOrFilter('+16175551234')).toBe(
      'phone.eq.+16175551234,phone.like.%6175551234'
    )
  })

  it('strips PostgREST-reserved chars so formatted numbers cannot 400 the query', () => {
    // Parens, commas, and dots are PostgREST operator syntax — leaving them in
    // would error the .or() and silently skip dedup.
    expect(buildPhoneOrFilter('(617) 555-1234')).toBe(
      'phone.eq.617 555-1234,phone.like.%6175551234'
    )
    expect(buildPhoneOrFilter('617.555.1234')).toBe(
      'phone.eq.6175551234,phone.like.%6175551234'
    )
  })

  it('returns null for numbers too short to match on', () => {
    expect(buildPhoneOrFilter('555-1234')).toBeNull()
  })
})

describe('pickPhoneMatch', () => {
  it('matches across storage formats', () => {
    const rows = [
      { id: 'a', phone: '+16175551234' },
      { id: 'b', phone: '9785550000' },
    ]
    expect(pickPhoneMatch(rows, '(617) 555-1234')?.id).toBe('a')
    expect(pickPhoneMatch(rows, '978.555.0000')?.id).toBe('b')
  })

  it('rejects like-filter false positives via the digits comparison', () => {
    // A stored short number can never equal a full last-10 key.
    const rows = [{ id: 'short', phone: '5551234' }]
    expect(pickPhoneMatch(rows, '6175551234')).toBeNull()
  })

  it('skips rows whose last 10 digits differ, even when other rows precede them', () => {
    const rows = [
      { id: 'wrong', phone: '9995551234' },
      { id: 'right', phone: '16175551234' },
    ]
    expect(pickPhoneMatch(rows, '6175551234')?.id).toBe('right')
  })

  it('handles null rows, empty rows, and rows without phones', () => {
    expect(pickPhoneMatch(null, '6175551234')).toBeNull()
    expect(pickPhoneMatch([], '6175551234')).toBeNull()
    expect(pickPhoneMatch([{ phone: null }], '6175551234')).toBeNull()
  })

  it('returns null when the raw input itself is unmatchable', () => {
    expect(pickPhoneMatch([{ phone: '6175551234' }], 'garbage')).toBeNull()
  })
})
