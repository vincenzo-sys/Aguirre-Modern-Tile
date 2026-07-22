// URL-safety helper for user/CMS-authored links (blog RichText, etc.).
//
// Returns true when an href uses a script-capable scheme (javascript:, data:,
// vbscript:) that would execute on click or render. A naive
// `startsWith('javascript:')` is bypassable: browsers ignore scheme case and
// strip ASCII whitespace (space, tab, newline, CR, form-feed) from URLs, so
// "JavaScript:", " javascript:", and "java\tscript:" all execute. We normalize
// — strip that whitespace and lowercase — before testing the scheme.
export function isDangerousHref(rawUrl: string): boolean {
  const probe = String(rawUrl ?? '').replace(/[\t\n\r\f\v ]/g, '').toLowerCase()
  return /^(javascript|data|vbscript):/.test(probe)
}
