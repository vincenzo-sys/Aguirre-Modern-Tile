// Maps quote-form answers (the JSONB blob saved on quote_requests.answers)
// to defaults for the GenerateEstimateModal so Vince doesn't re-type sqft
// and template every time. Vague hints — Vince still confirms in the modal.
//
// Source-of-truth for keys + values: src/app/(marketing)/quote/<type>/page.tsx
// (each defines a `questions` array). This helper matches those exact strings.

export type QuoteHints = {
  initialTemplate: string | null
  initialSqft: number | null
  // Addon flags the form answers already imply (keyed by template addon.key,
  // e.g. large_format). The modal seeds matching checkboxes from these so Vince
  // doesn't re-toggle what the customer already told us. Only keys an actual
  // template declares take effect; unknown keys are ignored downstream.
  initialAddons: Record<string, boolean>
}

// Tile-style / tile-size answers that mean "large-format" (12"+), which the
// estimator gates the Platinum-thinset swap on. 'pattern' counts because a
// mixed/large pattern layout sets like large-format. 'subway'/'mosaic' do not.
const LARGE_FORMAT_TILE_VALUES = new Set(['large', 'pattern'])

// Bathroom & shower sizes: midpoint of the band the form offers.
const BATHROOM_SIZE_SQFT: Record<string, number> = {
  small: 40,
  medium: 65,
  large: 100,
  master: 140,
}

// Shower form bands are dimensional ("3x3", "3x4 or 3x5", "4x5 or bigger").
// Floor area only — wall area is added by the template's sub_areas.
const SHOWER_SIZE_SQFT: Record<string, number> = {
  small: 9,
  standard: 13,
  large: 20,
  custom: 15,
}

// Kitchen floor bands map directly to sqft from the form labels.
const KITCHEN_FLOOR_SIZE_SQFT: Record<string, number> = {
  small: 75,
  medium: 150,
  large: 300,
  xlarge: 500,
}

// Backsplash form asks for linear feet, not sqft. Standard backsplash height
// is 18" (1.5 ft), so sqft ≈ linear feet × 1.5. Bands match form labels.
const BACKSPLASH_LINEAR_FEET_TO_SQFT: Record<string, number> = {
  small: 12,    // ~8 ft × 1.5
  medium: 23,   // ~15 ft × 1.5
  large: 38,    // ~25 ft × 1.5
  xlarge: 50,   // ~33 ft × 1.5
}

export function deriveQuoteHints(
  projectType: string | null,
  answers: Record<string, string> | null,
): QuoteHints {
  const a = answers ?? {}
  const type = (projectType ?? '').toLowerCase()

  let initialSqft: number | null = null
  let initialTemplate: string | null = null
  const initialAddons: Record<string, boolean> = {}

  // Large-format signal — backsplash asks `tileStyle`, kitchen floor asks
  // `tileSize`; both were previously dropped on the floor. Map either to the
  // large_format addon so the modal pre-checks it (drives the Platinum swap).
  if (LARGE_FORMAT_TILE_VALUES.has(a.tileStyle) || LARGE_FORMAT_TILE_VALUES.has(a.tileSize)) {
    initialAddons.large_format = true
  }

  if (type === 'bathroom') {
    initialSqft = BATHROOM_SIZE_SQFT[a.size] ?? null
    if (a.showerIncluded === 'shower-only') {
      initialTemplate = 'Walk-in Shower (Small)'
    } else if (a.projectScope === 'full-remodel' || a.projectScope === 'floor-and-walls') {
      initialTemplate = 'Tub Surround + Bathroom Floor'
    } else if (a.projectScope === 'walls-only') {
      initialTemplate = 'Standard Tub Surround'
    } else if (a.projectScope === 'floor-only') {
      initialTemplate = a.size === 'small' ? 'Bathroom Floor (Small)' : 'Bathroom Floor (Medium)'
    } else {
      // Fallback when scope wasn't picked: bias toward floor since walls
      // require more decisions Vince needs to ask about anyway.
      initialTemplate = a.size === 'small' ? 'Bathroom Floor (Small)' : 'Bathroom Floor (Medium)'
    }
  } else if (type === 'shower') {
    initialSqft = SHOWER_SIZE_SQFT[a.size] ?? null
    if (a.showerType === 'tub-shower') {
      initialTemplate = 'Standard Tub Surround'
    } else if (a.showerType === 'walkin') {
      initialTemplate = a.size === 'large' ? 'Walk-in Shower (Large)' : 'Walk-in Shower (Small)'
    } else {
      // standup or unsure — walk-in is the typical fit
      initialTemplate = a.size === 'large' ? 'Walk-in Shower (Large)' : 'Walk-in Shower (Small)'
    }
  } else if (type === 'backsplash') {
    initialSqft = BACKSPLASH_LINEAR_FEET_TO_SQFT[a.linearFeet] ?? null
    initialTemplate =
      a.linearFeet === 'large' || a.linearFeet === 'xlarge' || a.coverage === 'full-wall'
        ? 'Backsplash (Large/Complex)'
        : 'Backsplash (Standard)'
  } else if (type === 'kitchen-floor') {
    initialSqft = KITCHEN_FLOOR_SIZE_SQFT[a.size] ?? null
    // No dedicated kitchen-floor template — bathroom floor formulas reuse
    // the same materials (cement board, large-format tile, grout) so it's
    // the closest fit. Vince can swap if needed.
    initialTemplate = 'Bathroom Floor (Medium)'
  }

  // Exact measurement beats the size band. When the customer typed a real
  // number (new optional intake fields), use it instead of the band midpoint
  // so the estimate opens on the measured value, not a guess. Backsplash is
  // sized by linear feet (×1.5 for an 18" run), the rest by square feet.
  const exactSqft = Number(a.exactSqft)
  const exactLinearFeet = Number(a.exactLinearFeet)
  if (type === 'backsplash' && exactLinearFeet > 0) {
    initialSqft = Math.round(exactLinearFeet * 1.5)
  } else if (exactSqft > 0) {
    initialSqft = exactSqft
  }

  return { initialTemplate, initialSqft, initialAddons }
}

// Map a job's free-text job_type (e.g. "Bathroom Tile", "Shower Tile",
// "Backsplash") to the closest default estimator template, so the
// GenerateEstimateModal on the JOB page opens pre-selected instead of always
// defaulting to the first alphabetical template. Tolerant substring match;
// returns null when there's no clean analog (Vince picks in the modal).
export function templateForJobType(jobType: string | null): string | null {
  const t = (jobType ?? '').toLowerCase()
  if (!t) return null
  if (t.includes('backsplash')) return 'Backsplash (Standard)'
  if (t.includes('shower')) return 'Walk-in Shower (Small)'
  if (t.includes('floor')) return 'Bathroom Floor (Medium)'
  if (t.includes('bathroom')) return 'Tub Surround + Bathroom Floor'
  return null
}
