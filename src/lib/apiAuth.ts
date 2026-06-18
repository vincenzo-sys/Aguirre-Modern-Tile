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
