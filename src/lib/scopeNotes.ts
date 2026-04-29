// Round-trip parser + serializer for the canonical `jobs.scope_notes` text
// format. Five sections in fixed order, each prefaced by an uppercase header
// on its own line:
//
//   SCOPE OF WORK
//   <body>
//
//   WARRANTY
//   <text>
//
//   WHAT'S INCLUDED
//   - <bullet>
//   - <bullet>
//
//   WHAT'S NOT INCLUDED
//   - <bullet>
//
//   PAYMENT
//   <free-form notes>
//
// Why a single TEXT column and not five separate columns: legacy scopes were
// hand-typed in this format before we added structured editing, and the
// customer-facing estimate page already parses it. Keeping the storage format
// stable means zero migration and zero risk to existing live estimates.
//
// `parse` is forgiving — it accepts the legacy "preamble" pattern (text
// before any header gets treated as the scope body) and tolerates extra
// blank lines. `serialize` always emits the canonical form so a save +
// reload round-trips losslessly.

export type StructuredScope = {
  scopeOfWork: string
  warranty: string
  warrantyYears: number | null
  included: string[]
  notIncluded: string[]
  additionalNotes: string
  // True if the scope was successfully parsed into structured sections; false
  // when the input is empty or the parser didn't find recognizable headers
  // and put everything in the body. The editor uses this to decide whether
  // to show a "legacy raw scope" warning.
  isStructured: boolean
}

const SECTION_RE = /\n(SCOPE OF WORK|WARRANTY|WHAT'S INCLUDED|WHAT'S NOT INCLUDED|PAYMENT)\n/g

export function parseScopeNotes(notes: string | null | undefined): StructuredScope {
  const empty: StructuredScope = {
    scopeOfWork: '',
    warranty: '',
    warrantyYears: null,
    included: [],
    notIncluded: [],
    additionalNotes: '',
    isStructured: false,
  }
  if (!notes || !notes.trim()) return empty

  const input = '\n' + notes
  const matches = Array.from(input.matchAll(SECTION_RE))

  const parts: { header: string; text: string }[] = []
  let lastIndex = 0
  let lastHeader = 'PREAMBLE'
  for (const m of matches) {
    const idx = m.index ?? 0
    parts.push({ header: lastHeader, text: input.slice(lastIndex, idx).trim() })
    lastHeader = m[1]
    lastIndex = idx + m[0].length
  }
  parts.push({ header: lastHeader, text: input.slice(lastIndex).trim() })

  const get = (name: string) => parts.find((p) => p.header === name)?.text ?? ''
  const preamble = parts.find((p) => p.header === 'PREAMBLE')?.text ?? ''
  const scopeOfWork = get('SCOPE OF WORK') || preamble
  const warranty = get('WARRANTY')
  const includedText = get("WHAT'S INCLUDED")
  const notIncludedText = get("WHAT'S NOT INCLUDED")

  // PAYMENT is a free-form bucket for trailing policy notes. Strip the auto-
  // generator metadata that the Python estimator emits so it doesn't surface
  // in the editor or on the customer page.
  const paymentRaw = get('PAYMENT')
  const additionalNotes = paymentRaw
    .split('\n')
    .filter((line) => {
      const t = line.trim()
      if (/^Generated from /i.test(t)) return false
      if (/^Valid\s+\d+\s+days\./i.test(t)) return false
      return true
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  const toBullets = (t: string): string[] =>
    !t
      ? []
      : t
          .split('\n')
          .map((l) => l.replace(/^[-•]\s*/, '').trim())
          .filter(Boolean)

  let warrantyYears: number | null = null
  if (warranty) {
    const m = warranty.match(/(\d+)-year/i)
    if (m) warrantyYears = parseInt(m[1], 10)
  }

  return {
    scopeOfWork,
    warranty,
    warrantyYears,
    included: toBullets(includedText),
    notIncluded: toBullets(notIncludedText),
    additionalNotes,
    isStructured: matches.length > 0,
  }
}

// Emit the canonical text format from a structured scope. Empty sections are
// skipped so a scope with only "scope of work" + "warranty" doesn't render
// blank section headers on the customer page.
export function serializeScopeNotes(scope: Partial<StructuredScope>): string {
  const blocks: string[] = []

  const scopeOfWork = (scope.scopeOfWork ?? '').trim()
  if (scopeOfWork) {
    blocks.push(`SCOPE OF WORK\n${scopeOfWork}`)
  }

  const warranty = (scope.warranty ?? '').trim()
  if (warranty) {
    blocks.push(`WARRANTY\n${warranty}`)
  }

  const included = (scope.included ?? []).map((b) => b.trim()).filter(Boolean)
  if (included.length > 0) {
    blocks.push(`WHAT'S INCLUDED\n${included.map((b) => `- ${b}`).join('\n')}`)
  }

  const notIncluded = (scope.notIncluded ?? []).map((b) => b.trim()).filter(Boolean)
  if (notIncluded.length > 0) {
    blocks.push(`WHAT'S NOT INCLUDED\n${notIncluded.map((b) => `- ${b}`).join('\n')}`)
  }

  const additionalNotes = (scope.additionalNotes ?? '').trim()
  if (additionalNotes) {
    blocks.push(`PAYMENT\n${additionalNotes}`)
  }

  return blocks.join('\n\n')
}
