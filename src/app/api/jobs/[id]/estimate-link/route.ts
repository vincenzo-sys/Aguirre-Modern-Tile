import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { createServiceClient } from '@/lib/supabase/service'
import { requireApiAuth } from '@/lib/apiAuth'

function generateToken(): string {
  return randomBytes(18).toString('base64url')
}

// POST /api/jobs/[id]/estimate-link
// Generates (or returns existing) shareable estimate URL + marks sent_at
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
      .select('id, estimate_token, estimate_sent_at')
      .eq('id', id)
      .single()

    if (fetchErr || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    let token = job.estimate_token as string | null
    const updates: Record<string, unknown> = {}

    if (!token) {
      token = generateToken()
      updates.estimate_token = token
    }

    // Always refresh sent_at so "resend link" bumps the timestamp
    updates.estimate_sent_at = new Date().toISOString()

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
      url: `${baseUrl}/estimates/${token}`,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
