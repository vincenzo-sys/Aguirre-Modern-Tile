// ─────────────────────────────────────────────────────────────────────────────
// brand.config.ts — the ONE file that turns this dashboard into someone else's.
// ─────────────────────────────────────────────────────────────────────────────
//
// Everything a client deployment needs to change about *identity* lives here:
// company name, owner name, phone, email, domain, trade noun, service area.
// Nothing here is pricing, policy, or behaviour — those already live in
// Supabase (estimate_defaults, materials_pricing, labor_rates) and stay
// per-tenant data, not code.
//
// WHY A CONFIG FILE AND NOT JUST ENV VARS
// Env vars alone give you `process.env.NEXT_PUBLIC_BRAND_NAME || 'Aguirre...'`
// repeated in 40 files, and the fallback drifts. One typed object means a new
// client deployment is reviewable in a diff: you can read this file top to
// bottom and know exactly what their customers will see.
//
// WHY EVERY OVERRIDE IS `NEXT_PUBLIC_`
// The sidebar, the lead action sheet and the estimate print view are all
// `'use client'` components. Next.js only inlines an env var into the browser
// bundle when the name begins with NEXT_PUBLIC_ *and* it is written as a
// literal member expression (`process.env.NEXT_PUBLIC_BRAND_NAME`). A computed
// lookup like `process.env[key]` compiles to `undefined` on the client — the
// server would send SMS as "Nutmeg Tile" while the dashboard header still said
// "Aguirre Modern Tile". Hence: no loops, no dynamic keys, one literal per
// field. None of these values are secret; they are printed on the estimate.
//
// HOW TO DEPLOY FOR A CLIENT
// Do NOT fork this file. Set the NEXT_PUBLIC_BRAND_* vars in that client's
// Vercel project (see docs/white-label.md) and redeploy. The defaults below
// stay as Aguirre so the original deployment keeps working with zero env set.

/**
 * Reads one override with a hard-coded fallback.
 *
 * The caller must pass `process.env.NEXT_PUBLIC_...` directly as the first
 * argument so the bundler can see the literal and substitute it at build time.
 * Blank-but-present vars (a Vercel field someone cleared) fall back rather than
 * rendering an empty company name.
 */
function env(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim()
  return trimmed ? trimmed : fallback
}

/** Strips a trailing slash so `${origin}/quote` never doubles up. */
function normalizeOrigin(url: string): string {
  return url.replace(/\/+$/, '')
}

export interface BrandConfig {
  company: {
    /** Customer-facing display name. Appears in every SMS, email and header. */
    name: string
    /** Legal entity for contracts, W-9s and invoices. Usually NOT the display name. */
    legalName: string
    /** One-line descriptor under the company name on the printed estimate. */
    tagline: string
    /** Who signs the outbound texts and emails ("- Vince"). */
    ownerFirstName: string
    /** Named in crew-approval texts. */
    crewLeadFirstName: string
  }
  trade: {
    /** Singular noun for the work: "tile", "paving", "roofing". */
    noun: string
    /** How the finished work is described: "tile work", "the new tile". */
    workNoun: string
    /** What a visit is called: "install", "job", "shoot". */
    visitNoun: string
  }
  contact: {
    /** Human-readable, as printed: "(617) 766-1259". */
    phoneDisplay: string
    /** Dialable E.164 for `tel:` and `sms:` links. */
    phoneE164: string
    /** Owner-facing inbox — where customer replies ultimately land. */
    email: string
  }
  location: {
    city: string
    state: string
    /** Base address used for mileage and "serving X" copy. */
    headquarters: string
  }
  web: {
    /** Canonical origin, no trailing slash. Drives canonicals, OG, sitemap. */
    origin: string
    /** Bare host, for iCal UIDs and copy that reads a domain aloud. */
    domain: string
  }
  /** Lowercase, hyphenated. Lead-source tags, iCal PRODID, log prefixes. */
  slug: string
}

export const BRAND: BrandConfig = {
  company: {
    name: env(process.env.NEXT_PUBLIC_BRAND_NAME, 'Aguirre Modern Tile'),
    legalName: env(
      process.env.NEXT_PUBLIC_BRAND_LEGAL_NAME,
      'Aguirre Modern Tile & Masonry LLC'
    ),
    tagline: env(
      process.env.NEXT_PUBLIC_BRAND_TAGLINE,
      'Professional Tile Installation — Revere, MA'
    ),
    ownerFirstName: env(process.env.NEXT_PUBLIC_BRAND_OWNER_FIRST_NAME, 'Vince'),
    crewLeadFirstName: env(
      process.env.NEXT_PUBLIC_BRAND_CREW_LEAD_FIRST_NAME,
      'Christian'
    ),
  },
  trade: {
    noun: env(process.env.NEXT_PUBLIC_BRAND_TRADE_NOUN, 'tile'),
    workNoun: env(process.env.NEXT_PUBLIC_BRAND_TRADE_WORK_NOUN, 'tile work'),
    visitNoun: env(process.env.NEXT_PUBLIC_BRAND_TRADE_VISIT_NOUN, 'install'),
  },
  contact: {
    phoneDisplay: env(process.env.NEXT_PUBLIC_BRAND_PHONE_DISPLAY, '(617) 766-1259'),
    phoneE164: env(process.env.NEXT_PUBLIC_BRAND_PHONE_E164, '+16177661259'),
    email: env(process.env.NEXT_PUBLIC_BRAND_EMAIL, 'vin@moderntile.pro'),
  },
  location: {
    city: env(process.env.NEXT_PUBLIC_BRAND_CITY, 'Revere'),
    state: env(process.env.NEXT_PUBLIC_BRAND_STATE, 'MA'),
    headquarters: env(process.env.NEXT_PUBLIC_BRAND_HEADQUARTERS, 'Revere, MA 02151'),
  },
  web: {
    // Canonical host. Vercel serves this site on www and redirects the apex,
    // so declaring www here is what keeps canonicals, OG urls and the sitemap
    // pointing at a host that actually answers 200.
    origin: normalizeOrigin(
      env(process.env.NEXT_PUBLIC_BRAND_ORIGIN, 'https://www.aguirremoderntile.com')
    ),
    domain: env(process.env.NEXT_PUBLIC_BRAND_DOMAIN, 'aguirremoderntile.com'),
  },
  slug: env(process.env.NEXT_PUBLIC_BRAND_SLUG, 'aguirre-tile'),
}

// ─── Derived helpers ────────────────────────────────────────────────────────
// Prefer these over re-deriving from BRAND at each call site, so a change to
// how a signature or a URL is composed happens once.

/** Absolute URL on the canonical host. `brandUrl('/quote')`. */
export function brandUrl(path = '/'): string {
  return `${BRAND.web.origin}${path.startsWith('/') ? path : `/${path}`}`
}

/** SMS sign-off with the owner's name: "- Vince, Aguirre Modern Tile". */
export function smsSignature(): string {
  return `- ${BRAND.company.ownerFirstName}, ${BRAND.company.name}`
}

/** SMS sign-off from the company only: "- Aguirre Modern Tile". */
export function companySignature(): string {
  return `- ${BRAND.company.name}`
}

/** Default Resend From header. Overridden by RESEND_FROM_EMAIL when set. */
export function brandFromEmail(address: string): string {
  return `${BRAND.company.name} <${address}>`
}

/**
 * Which brand fields are still on the Aguirre defaults.
 *
 * The failure mode this exists for: a client deployment goes live with the env
 * vars unset, and their customers get texts signed "Aguirre Modern Tile". That
 * is invisible in a build log — the app is perfectly healthy, it is just
 * wearing the wrong name. Call this from a deploy check or an ops route and
 * refuse to ship a non-Aguirre tenant with a non-empty result.
 *
 * Returns the env var names that are unset, so the message can name them.
 */
export function unbrandedFields(): string[] {
  const missing: string[] = []
  if (!process.env.NEXT_PUBLIC_BRAND_NAME?.trim()) missing.push('NEXT_PUBLIC_BRAND_NAME')
  if (!process.env.NEXT_PUBLIC_BRAND_OWNER_FIRST_NAME?.trim())
    missing.push('NEXT_PUBLIC_BRAND_OWNER_FIRST_NAME')
  if (!process.env.NEXT_PUBLIC_BRAND_PHONE_DISPLAY?.trim())
    missing.push('NEXT_PUBLIC_BRAND_PHONE_DISPLAY')
  if (!process.env.NEXT_PUBLIC_BRAND_EMAIL?.trim()) missing.push('NEXT_PUBLIC_BRAND_EMAIL')
  if (!process.env.NEXT_PUBLIC_BRAND_ORIGIN?.trim()) missing.push('NEXT_PUBLIC_BRAND_ORIGIN')
  return missing
}

export default BRAND
