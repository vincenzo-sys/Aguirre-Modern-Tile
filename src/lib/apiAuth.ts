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
