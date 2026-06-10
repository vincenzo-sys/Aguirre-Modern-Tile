import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { createServiceClient } from '@/lib/supabase/service'
import { requireApiAuth } from '@/lib/apiAuth'

function generateToken(): string {
  return randomBytes(18).toString('base64url')
}

// POST /api/jobs/[id]/work-order-link
// Generates (or returns existing) the crew-facing work order URL.
// Separate token from estimate_token so this link can never expose pricing.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireApiAuth(req)
  if (unauthorized) return unauthorized

  try {
    const { id } = await params
    const supabase = createServiceClient()

    const { data: job, error: fetchErr } = await supabase
      .from('jobs')
      .select('id, work_order_token')
      .eq('id', id)
      .single()

    if (fetchErr || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    let token = job.work_order_token as string | null
    const updates: Record<string, unknown> = {}

    if (!token) {
      token = generateToken()
      updates.work_order_token = token
    }

    // Always refresh shared_at so "resend link" bumps the timestamp.
    updates.work_order_shared_at = new Date().toISOString()

    const { error: updateErr } = await supabase
      .from('jobs')
      .update(updates)
      .eq('id', id)

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ||
      req.nextUrl.origin

    return NextResponse.json({
      token,
      url: `${baseUrl}/work-orders/${token}`,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
