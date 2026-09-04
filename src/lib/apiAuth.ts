import { NextRequest, NextResponse } from 'next/server'
import { createClient } from './supabase/server'

/**
 * Authorizes an API request either via:
 *   1. An X-API-Key header matching env TILE_API_KEY (for MCP / external clients)
 *   2. An authenticated Supabase session (dashboard users)
 *
 * Returns null on success, or an error NextResponse on failure.
 */
export async function requireApiAuth(req: NextRequest): Promise<NextResponse | null> {
  const provided = req.headers.get('x-api-key') ?? req.headers.get('X-API-Key')
  const expected = process.env.TILE_API_KEY

  if (provided && expected && provided === expected) {
    return null
  }

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) return null
  } catch {
    // fall through to 401
  }

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

/**
 * Authorizes a scheduled (cron) invocation. Authorization: Bearer <CRON_SECRET>
 * and nothing else.
 *
 * Vercel injects this header on scheduled runs when CRON_SECRET is set in the
 * project env. The `x-vercel-cron` header is deliberately NOT accepted: any
 * external caller can set it, and these routes send customer SMS, draft
 * invoices, and move money. Fails closed when CRON_SECRET is unset, so a
 * misconfigured deploy refuses rather than running unauthenticated.
 *
 * Synchronous, unlike its siblings above — there is one header and one env var
 * to compare, and no session to await.
 *
 * Returns null on success, a 401 NextResponse otherwise.
 */
export function requireCronSecret(req: NextRequest): NextResponse | null {
  const expected = process.env.CRON_SECRET
  if (expected && req.headers.get('authorization') === `Bearer ${expected}`) {
    return null
  }
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

/**
 * The profiles.id of the human behind this request, or null.
 *
 * requireApiAuth deliberately returns only a response-or-null, so it can't tell
 * a caller WHO authenticated — fine for gating, useless for attribution. This
 * sibling exists so writes can record authorship (e.g. job_estimates.created_by,
 * which drives both the "who changed this quote" column in version history and
 * the coalescing rule that refuses to merge two people's edits into one
 * revision).
 *
 * Returns null for X-API-Key callers: they are a trusted server, not a person,
 * and inventing a profile id for them would misattribute the change.
 */
export async function currentActorId(req: NextRequest): Promise<string | null> {
  const provided = req.headers.get('x-api-key') ?? req.headers.get('X-API-Key')
  const expected = process.env.TILE_API_KEY
  if (provided && expected && provided === expected) return null

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    return user?.id ?? null
  } catch {
    return null
  }
}

/**
 * Like requireApiAuth, but additionally requires OWNER privileges for the
 * mutation to proceed. Needed because route handlers use the service-role
 * Supabase client, which bypasses the "owner manage" RLS policy — so the
 * owner check has to be enforced in the handler.
 *
 * Authorized when EITHER:
 *   1. The X-API-Key matches TILE_API_KEY (trusted server / MCP caller), or
 *   2. The session user's profile has role === 'owner'.
 *
 * Returns null on success, a 401/403 NextResponse otherwise.
 */
export async function requireApiOwner(req: NextRequest): Promise<NextResponse | null> {
  const unauthorized = await requireApiAuth(req)
  if (unauthorized) return unauthorized

  // Trusted API-key callers act as owner.
  const provided = req.headers.get('x-api-key') ?? req.headers.get('X-API-Key')
  const expected = process.env.TILE_API_KEY
  if (provided && expected && provided === expected) return null

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
      if (profile?.role === 'owner') return null
    }
  } catch {
    // fall through to 403
  }

  return NextResponse.json({ error: 'Forbidden — owner only' }, { status: 403 })
}
