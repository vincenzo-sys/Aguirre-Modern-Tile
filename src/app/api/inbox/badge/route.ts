import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireApiAuth } from '@/lib/apiAuth'
import { buildInbox } from '@/lib/inbox'

// GET /api/inbox/badge — unread-thread count for the nav badge. Counts
// threads with something waiting (not raw messages): five texts from one
// person is one person waiting on you.
export async function GET(req: NextRequest) {
  const unauthorized = await requireApiAuth(req)
  if (unauthorized) return unauthorized

  try {
    const { unread_threads } = await buildInbox(createServiceClient())
    return NextResponse.json({ count: unread_threads })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
