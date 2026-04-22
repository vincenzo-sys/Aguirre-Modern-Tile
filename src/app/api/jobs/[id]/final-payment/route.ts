import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { requireApiAuth } from '@/lib/apiAuth'

// POST /api/jobs/[id]/final-payment
// Records that the final payment was received. Owner or crew can call it.
// Bumps jobs.amount_paid by the payment amount, stamps the final_payment_*
// columns with who/when/how, appends a crew_log entry, and flips status to
// 'paid' when amount_paid covers estimated_cost (with $1 tolerance).

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Separately get the calling user from the session cookie so we can
// attribute the payment to them. API-key callers have no session; in that
// case we leave final_payment_by_profile_id null.
async function getSessionProfileId(): Promise<string | null> {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll() { /* no-op */ },
        },
      }
    )
    const { data: { user } } = await supabase.auth.getUser()
    return user?.id ?? null
  } catch {
    return null
  }
}

type Method = 'cash' | 'check' | 'stripe' | 'zelle' | 'venmo' | 'other'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireApiAuth(req)
  if (unauthorized) return unauthorized

  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as {
    amount?: number
    method?: Method
    note?: string
  }

  const amount = Number(body.amount)
  const method = body.method
  const note = (body.note ?? '').trim() || null

  if (!amount || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 })
  }
  if (!method || !['cash', 'check', 'stripe', 'zelle', 'venmo', 'other'].includes(method)) {
    return NextResponse.json(
      { error: 'method required: cash, check, stripe, zelle, venmo, or other' },
      { status: 400 }
    )
  }

  const supabase = getSupabase()

  const { data: job, error: fetchErr } = await supabase
    .from('jobs')
    .select('id, status, amount_paid, estimated_cost, crew_log, client_name')
    .eq('id', id)
    .single()

  if (fetchErr || !job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  const profileId = await getSessionProfileId()
  let authorName = 'Team'
  if (profileId) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', profileId)
      .single()
    if (profile?.full_name) authorName = profile.full_name
  }

  const previousAmountPaid = Number(job.amount_paid ?? 0)
  const newAmountPaid = Math.round((previousAmountPaid + amount) * 100) / 100
  const estimated = Number(job.estimated_cost ?? 0)

  // Flip to 'paid' if we've now covered the estimate (allow $1 slop for
  // rounding or small deposits-that-don't-quite-add-up). If estimated_cost
  // is unset, we trust the human — any final_payment means paid.
  const coversBalance = estimated > 0 ? newAmountPaid >= estimated - 1 : true
  const nextStatus =
    coversBalance && job.status !== 'paid' && job.status !== 'cancelled'
      ? 'paid'
      : job.status

  const stamp = new Date().toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
  const logLine = `[${stamp} — ${authorName}] Final payment received: $${amount.toFixed(2)} via ${method}${note ? ` (${note})` : ''}`
  const existingLog = typeof job.crew_log === 'string' ? job.crew_log : ''
  const updatedLog = existingLog ? `${logLine}\n${existingLog}` : logLine

  const { data: updated, error: updateErr } = await supabase
    .from('jobs')
    .update({
      amount_paid: newAmountPaid,
      final_payment_at: new Date().toISOString(),
      final_payment_amount: amount,
      final_payment_method: method,
      final_payment_note: note,
      final_payment_by_profile_id: profileId,
      status: nextStatus,
      crew_log: updatedLog,
    })
    .eq('id', id)
    .select()
    .single()

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  console.log(
    `[FinalPayment] Job ${id}: +$${amount} via ${method} (by ${authorName}). ` +
      `amount_paid ${previousAmountPaid} → ${newAmountPaid}. Status ${job.status} → ${nextStatus}.`
  )

  return NextResponse.json({
    job: updated,
    previous_amount_paid: previousAmountPaid,
    new_amount_paid: newAmountPaid,
    status_changed: nextStatus !== job.status,
    author: authorName,
  })
}
