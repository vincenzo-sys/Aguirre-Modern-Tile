import type { SupabaseClient } from '@supabase/supabase-js'
import type { PipelineStage } from '@/app/api/pipeline/route'
import { last10 } from '@/lib/phoneMatch'
import { ACTIVE_JOB_STATUSES } from '@/lib/lastContact'

// The Inbox read model: one conversation per phone number, merged across
// SMS (message_log), calls (call_log), and website leads (quote_requests),
// answering exactly one question — who's waiting on me right now.
//
// Thread identity is the last-10 digits of the phone number. No conversation
// table exists; grouping happens here. `groupInboxThreads` is pure so the
// merge/unread/sort logic is unit-testable; `buildInbox` wraps it with the
// five queries. Channels are a union ('sms' | 'call' | 'website') so inbound
// email can join later without reshaping the model.

export type InboxChannel = 'sms' | 'call' | 'website'

export type MessageLogRow = {
  id: string
  customer_id: string | null
  job_id: string | null
  phone_number: string
  direction: string
  message: string
  trigger_type: string
  status: string
  read_at: string | null
  created_at: string
}

export type CallLogRow = {
  id: string
  customer_id: string | null
  phone_number: string
  direction: string
  status: string
  duration: number | null
  recording_url: string | null
  transcript: string | null
  read_at: string | null
  created_at: string
}

export type InboxCustomerRow = {
  id: string
  name: string | null
  phone: string | null
}

export type InboxQuoteRequestRow = {
  id: string
  status: string // 'new' | 'reviewed' (open, unconverted only)
  client_name: string
  client_phone: string | null
  project_type: string | null
  customer_id: string | null
  site_visit_at: string | null
  created_at: string
}

export type InboxJobRow = {
  id: string
  status: string
  customer_id: string | null
  client_phone: string | null
  client_name: string | null
  title: string | null
}

// 'in_progress' / 'waiting_for_materials' have no pipeline stage — the UI
// renders them with a neutral chip and a prettified label.
export type InboxLead = {
  kind: 'quote_request' | 'job'
  id: string
  stage: PipelineStage | 'in_progress' | 'waiting_for_materials'
}

export type InboxPreview = {
  type: 'sms' | 'call' | 'website'
  direction: 'inbound' | 'outbound'
  text: string
}

export type InboxThread = {
  key: string // last-10 digits, or `qr:<id>` for phone-less website leads
  phone_e164: string | null
  phone_raw: string | null // display fallback when no E.164 was ever seen
  display_name: string | null
  customer_id: string | null
  lead: InboxLead | null
  channels: InboxChannel[]
  last_activity_at: string
  preview: InboxPreview
  unread: number
}

// Thread key for a phone in any format. Falls back to whatever digits exist
// (short codes, partials) so odd senders still group consistently.
export function threadKeyForPhone(phone: string | null | undefined): string | null {
  const key = last10(phone)
  if (key) return key
  const digits = (phone ?? '').replace(/\D/g, '')
  return digits || null
}

export function previewForCall(call: Pick<CallLogRow, 'status' | 'direction'>): string {
  if (call.status === 'voicemail') return 'Voicemail'
  if (call.status === 'missed') return 'Missed call'
  return call.direction === 'outbound' ? 'Outgoing call' : 'Call'
}

const JOB_STATUS_TO_STAGE: Record<string, InboxLead['stage']> = {
  lead: 'quoted', // pre-estimate job — same fallback the pipeline uses
  quoted: 'quoted',
  estimate_revised: 'edits_needed',
  awaiting_response: 'awaiting_response',
  accepted_not_scheduled: 'accepted_not_scheduled',
  scheduled: 'scheduled',
  in_progress: 'in_progress',
  waiting_for_materials: 'waiting_for_materials',
  completed: 'completed',
}

type WorkingThread = Omit<InboxThread, 'channels'> & { channels: Set<InboxChannel> }

export function groupInboxThreads(input: {
  messages: MessageLogRow[]
  calls: CallLogRow[]
  customers: InboxCustomerRow[]
  quoteRequests: InboxQuoteRequestRow[]
  jobs: InboxJobRow[]
}): InboxThread[] {
  const threads = new Map<string, WorkingThread>()

  const getThread = (key: string): WorkingThread => {
    let t = threads.get(key)
    if (!t) {
      t = {
        key,
        phone_e164: null,
        phone_raw: null,
        display_name: null,
        customer_id: null,
        lead: null,
        channels: new Set<InboxChannel>(),
        last_activity_at: '',
        preview: { type: 'sms', direction: 'inbound', text: '' },
        unread: 0,
      }
      threads.set(key, t)
    }
    return t
  }

  // Newest event wins the preview + timestamp regardless of input order.
  const touch = (t: WorkingThread, at: string, preview: InboxPreview) => {
    if (at > t.last_activity_at) {
      t.last_activity_at = at
      t.preview = preview
    }
  }

  const notePhone = (t: WorkingThread, phone: string) => {
    if (phone.startsWith('+')) t.phone_e164 = t.phone_e164 ?? phone
    else t.phone_raw = t.phone_raw ?? phone
  }

  for (const msg of input.messages) {
    const key = threadKeyForPhone(msg.phone_number)
    if (!key) continue
    const t = getThread(key)
    t.channels.add('sms')
    notePhone(t, msg.phone_number)
    if (msg.customer_id) t.customer_id = t.customer_id ?? msg.customer_id
    if (msg.direction === 'inbound' && !msg.read_at) t.unread += 1
    touch(t, msg.created_at, {
      type: 'sms',
      direction: msg.direction === 'outbound' ? 'outbound' : 'inbound',
      text: msg.message,
    })
  }

  for (const call of input.calls) {
    const key = threadKeyForPhone(call.phone_number)
    if (!key) continue
    const t = getThread(key)
    t.channels.add('call')
    notePhone(t, call.phone_number)
    if (call.customer_id) t.customer_id = t.customer_id ?? call.customer_id
    if (call.direction === 'inbound' && !call.read_at) t.unread += 1
    touch(t, call.created_at, {
      type: 'call',
      direction: call.direction === 'outbound' ? 'outbound' : 'inbound',
      text: previewForCall(call),
    })
  }

  // Resolve customers: by the id already on a log row, else by phone digits.
  const customerById = new Map(input.customers.map((c) => [c.id, c]))
  const customerByPhoneKey = new Map<string, InboxCustomerRow>()
  for (const c of input.customers) {
    const key = threadKeyForPhone(c.phone)
    if (key && !customerByPhoneKey.has(key)) customerByPhoneKey.set(key, c)
  }
  const threadByCustomerId = new Map<string, WorkingThread>()
  for (const t of threads.values()) {
    if (!t.customer_id) {
      const c = customerByPhoneKey.get(t.key)
      if (c) t.customer_id = c.id
    }
    if (t.customer_id) {
      t.display_name = customerById.get(t.customer_id)?.name ?? null
      if (!threadByCustomerId.has(t.customer_id)) threadByCustomerId.set(t.customer_id, t)
    }
  }

  // Merge open website leads. A QR that shares a phone (or customer) with an
  // existing conversation joins that thread; otherwise it becomes its own
  // row — keyed by phone when it has one (so a later text merges cleanly),
  // else by `qr:<id>`.
  const sortedQrs = [...input.quoteRequests].sort((a, b) => a.created_at.localeCompare(b.created_at))
  for (const qr of sortedQrs) {
    const phoneKey = threadKeyForPhone(qr.client_phone)
    const existing =
      (phoneKey && threads.get(phoneKey)) ||
      (qr.customer_id && threadByCustomerId.get(qr.customer_id)) ||
      null
    const t = existing ?? getThread(phoneKey ?? `qr:${qr.id}`)
    t.channels.add('website')
    if (qr.client_phone) notePhone(t, qr.client_phone)
    t.customer_id = t.customer_id ?? qr.customer_id
    t.display_name = t.display_name ?? qr.client_name
    if (qr.status === 'new') t.unread += 1
    // Later QRs overwrite: the most recent open inquiry is "the lead".
    t.lead = {
      kind: 'quote_request',
      id: qr.id,
      stage: qr.site_visit_at ? 'in_person_estimate_scheduled' : 'new',
    }
    touch(t, qr.created_at, {
      type: 'website',
      direction: 'inbound',
      text: `New quote request — ${(qr.project_type ?? 'project').replace(/-/g, ' ')}`,
    })
    if (t.customer_id && !threadByCustomerId.has(t.customer_id)) threadByCustomerId.set(t.customer_id, t)
  }

  // Link jobs to threads that still have no lead, so the stage chip shows
  // where the conversation sits in the pipeline.
  const jobByCustomer = new Map<string, InboxJobRow>()
  const jobByPhoneKey = new Map<string, InboxJobRow>()
  for (const job of input.jobs) {
    if (job.customer_id && !jobByCustomer.has(job.customer_id)) jobByCustomer.set(job.customer_id, job)
    const key = threadKeyForPhone(job.client_phone)
    if (key && !jobByPhoneKey.has(key)) jobByPhoneKey.set(key, job)
  }
  for (const t of threads.values()) {
    if (t.lead) continue
    const job = (t.customer_id && jobByCustomer.get(t.customer_id)) || jobByPhoneKey.get(t.key) || null
    if (!job) continue
    t.lead = { kind: 'job', id: job.id, stage: JOB_STATUS_TO_STAGE[job.status] ?? 'quoted' }
    t.display_name = t.display_name ?? job.client_name ?? null
  }

  return [...threads.values()]
    .sort((a, b) => b.last_activity_at.localeCompare(a.last_activity_at))
    .map((t) => ({ ...t, channels: [...t.channels] }))
}

// Fetch + group. Used by /api/inbox (full list) and /api/inbox/badge (count).
// Log queries are capped at the most recent 300 rows each — at this volume
// that's months of history, and the list is time-ordered so anything older
// has long since been handled.
export async function buildInbox(
  supabase: SupabaseClient
): Promise<{ threads: InboxThread[]; unread_threads: number }> {
  const [messagesRes, callsRes, customersRes, qrRes, jobsRes] = await Promise.all([
    supabase
      .from('message_log')
      .select('id, customer_id, job_id, phone_number, direction, message, trigger_type, status, read_at, created_at')
      .order('created_at', { ascending: false })
      .limit(300),
    supabase
      .from('call_log')
      .select('id, customer_id, phone_number, direction, status, duration, recording_url, transcript, read_at, created_at')
      .order('created_at', { ascending: false })
      .limit(300),
    supabase.from('customers').select('id, name, phone').not('phone', 'is', null),
    supabase
      .from('quote_requests')
      .select('id, status, client_name, client_phone, project_type, customer_id, site_visit_at, created_at')
      .in('status', ['new', 'reviewed'])
      .is('converted_job_id', null),
    supabase
      .from('jobs')
      .select('id, status, customer_id, client_phone, client_name, title')
      .in('status', [...ACTIVE_JOB_STATUSES, 'completed']),
  ])

  const firstError =
    messagesRes.error || callsRes.error || customersRes.error || qrRes.error || jobsRes.error
  if (firstError) throw new Error(firstError.message)

  const threads = groupInboxThreads({
    messages: (messagesRes.data ?? []) as MessageLogRow[],
    calls: (callsRes.data ?? []) as CallLogRow[],
    customers: (customersRes.data ?? []) as InboxCustomerRow[],
    quoteRequests: (qrRes.data ?? []) as InboxQuoteRequestRow[],
    jobs: (jobsRes.data ?? []) as InboxJobRow[],
  })

  return { threads, unread_threads: threads.filter((t) => t.unread > 0).length }
}
