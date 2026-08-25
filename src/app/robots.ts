import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

// The CRM and everything behind it. Never crawlable, by anyone.
// /dashboard/ is the CRM itself, /login its auth page, /api/ the whole
// server surface (estimate tokens, Stripe webhooks, cron routes) and
// /work-orders/ the printable crew sheets with customer addresses on them.
const CRM_DISALLOW = ['/dashboard/', '/login', '/api/', '/work-orders/']

// robots.txt groups do NOT cascade.
//
// Per RFC 9309 a crawler picks the SINGLE most specific group whose
// User-agent line matches it, obeys that group, and ignores every other
// group in the file — including `User-agent: *`. So the moment we name an
// agent in order to welcome it, that agent stops inheriting the `*` block:
// writing `User-agent: GPTBot` + `Allow: /` and nothing else would hand
// OpenAI /dashboard/, /login, /api/ and /work-orders/ outright.
//
// That is why every group below is built from the same CRM_DISALLOW array
// instead of being written out by hand — the disallow list physically
// cannot drift between groups, and adding an agent to AI_AGENTS can never
// accidentally open the CRM.
const AI_AGENTS = [
  // OpenAI — training crawler, ChatGPT search index, user-initiated fetch
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  // Perplexity — index + user-initiated fetch
  'PerplexityBot',
  'Perplexity-User',
  // Anthropic
  'ClaudeBot',
  'Claude-SearchBot',
  'Claude-User',
  // Google AI Overviews / Gemini grounding. Separate token from Googlebot:
  // blocking this would NOT affect normal Search ranking, and allowing it
  // is what keeps the site eligible to be cited in AI Overviews.
  'Google-Extended',
  // Apple Intelligence / Siri summaries
  'Applebot-Extended',
]

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // Default group — Googlebot, Bingbot and everything unnamed above.
      { userAgent: '*', allow: '/', disallow: CRM_DISALLOW },
      // Named AI groups. Same access as `*`, stated explicitly so the
      // answer engines are not left guessing, and each one repeats the
      // CRM disallows because it does not inherit them.
      ...AI_AGENTS.map((userAgent) => ({
        userAgent,
        allow: '/',
        disallow: CRM_DISALLOW,
      })),
    ],
    // Must be the host we actually serve. Pointing this at the apex made
    // Google fetch a 307 to reach the sitemap, and then read 3,444 apex
    // URLs that each redirected again.
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
