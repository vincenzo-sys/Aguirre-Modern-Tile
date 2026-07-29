import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireApiAuth } from '@/lib/apiAuth'
import { buildInbox } from '@/lib/inbox'

// GET /api/inbox — the unified intake list: one thread per conversation
// across SMS, calls, and website leads, newest activity first.
export async function GET(req: NextRequest) {
  const unauthorized = await requireApiAuth(req)
  if (unauthorized) return unauthorized

  try {
    const { threads, unread_threads } = await buildInbox(createServiceClient())
    return NextResponse.json({ threads, unread_threads })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
