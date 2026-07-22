import { describe, it, expect } from 'vitest'
import { isDangerousHref } from './urlSafety'

describe('isDangerousHref — blocks script-capable schemes incl. bypass variants', () => {
  const dangerous = [
    'javascript:alert(1)',
    'JavaScript:alert(1)', // case-insensitive scheme
    'JAVASCRIPT:alert(1)',
    ' javascript:alert(1)', // leading space (browsers strip it)
    '\tjavascript:alert(1)', // leading tab
    '\n javascript:alert(1)', // leading newline + space
    'java\tscript:alert(1)', // embedded tab in the scheme
    'jav\nascript:alert(1)', // embedded newline
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'VbScript:msgbox(1)',
  ]
  for (const url of dangerous) {
    it(`blocks ${JSON.stringify(url)}`, () => {
      expect(isDangerousHref(url)).toBe(true)
    })
  }

  const safe = [
    'https://example.com/page',
    'http://example.com',
    'mailto:vin@moderntile.pro',
    'tel:+16177661259',
    '/blog/some-post',
    '#section',
    'relative/path',
    '',
    'javascriptx://not-really', // "javascriptx:" is not the javascript: scheme
    'my-javascript:notascheme', // scheme doesn't start at position 0
  ]
  for (const url of safe) {
    it(`allows ${JSON.stringify(url)}`, () => {
      expect(isDangerousHref(url)).toBe(false)
    })
  }
})
