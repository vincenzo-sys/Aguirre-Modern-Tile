import type { SupabaseClient } from '@supabase/supabase-js'

// Job statuses where the customer conversation is still live — everything
// before the terminal completed/paid/cancelled. Inbound contact on these
// resets staleness so the nurture cron doesn't nudge someone who just
// called or texted back.
export const ACTIVE_JOB_STATUSES = [
  'lead',
  'quoted',
  'estimate_revised',
  'awaiting_response',
  'accepted_not_scheduled',
  'scheduled',
  'in_progress',
  'waiting_for_materials',
]

// Stamp last_contact_at on a customer's open quote requests AND active jobs.
// Both tables matter: the pipeline UI reads staleness from the linked
// quote_request, while the estimate-nudge cron reads jobs.last_contact_at.
// Called when the customer texts/calls in (webhook) and when the team
// replies from the Inbox — both directions are "contact".
export async function bumpLastContactForCustomer(
  supabase: SupabaseClient,
  customerId: string
): Promise<void> {
  const now = new Date().toISOString()
  await Promise.all([
    supabase
      .from('quote_requests')
      .update({ last_contact_at: now })
      .eq('customer_id', customerId)
      .not('status', 'in', '(converted,archived)'),
    supabase
      .from('jobs')
      .update({ last_contact_at: now })
      .eq('customer_id', customerId)
      .in('status', ACTIVE_JOB_STATUSES),
  ])
}

// The customer's single active job, or null when there are zero or several —
// callers use this to attach an inbound message to a job only when the link
// is unambiguous.
export async function findSingleActiveJobId(
  supabase: SupabaseClient,
  customerId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('jobs')
    .select('id')
    .eq('customer_id', customerId)
    .in('status', ACTIVE_JOB_STATUSES)
    .limit(2)
  return data && data.length === 1 ? data[0].id : null
}
