import { describe, it, expect } from 'vitest'
import {
  groupInboxThreads,
  threadKeyForPhone,
  threadKeyForEmail,
  previewForCall,
  type MessageLogRow,
  type CallLogRow,
  type InboxCustomerRow,
  type InboxQuoteRequestRow,
  type InboxJobRow,
  type EmailLogRow,
} from './inbox'

const msg = (over: Partial<MessageLogRow>): MessageLogRow => ({
  id: 'm1',
  customer_id: null,
  job_id: null,
  phone_number: '+16175551234',
  direction: 'inbound',
  message: 'hello',
  trigger_type: 'customer_reply',
  status: 'delivered',
  read_at: null,
  created_at: '2026-07-20T10:00:00.000Z',
  ...over,
})

const call = (over: Partial<CallLogRow>): CallLogRow => ({
  id: 'c1',
  customer_id: null,
  phone_number: '+16175551234',
  direction: 'inbound',
  status: 'missed',
  duration: 0,
  recording_url: null,
  transcript: null,
  read_at: null,
  created_at: '2026-07-20T11:00:00.000Z',
  ...over,
})

const qr = (over: Partial<InboxQuoteRequestRow>): InboxQuoteRequestRow => ({
  id: 'q1',
  status: 'new',
  client_name: 'Jane Doe',
  client_phone: '(617) 555-1234',
  project_type: 'bathroom',
  customer_id: null,
  site_visit_at: null,
  created_at: '2026-07-19T09:00:00.000Z',
  ...over,
})

const email = (over: Partial<EmailLogRow>): EmailLogRow => ({
  id: 'e1',
  customer_id: null,
  direction: 'inbound',
  from_email: 'jane@example.com',
  to_email: 'vince@reply.moderntile.pro',
  subject: 'About my estimate',
  read_at: null,
  created_at: '2026-07-22T09:00:00.000Z',
  ...over,
})

const group = (input: {
  messages?: MessageLogRow[]
  calls?: CallLogRow[]
  customers?: InboxCustomerRow[]
  quoteRequests?: InboxQuoteRequestRow[]
  jobs?: InboxJobRow[]
  emails?: EmailLogRow[]
}) =>
  groupInboxThreads({
    messages: input.messages ?? [],
    calls: input.calls ?? [],
    customers: input.customers ?? [],
    quoteRequests: input.quoteRequests ?? [],
    jobs: input.jobs ?? [],
    emails: input.emails ?? [],
  })

describe('threadKeyForPhone', () => {
  it('normalizes any format to last-10 digits', () => {
    expect(threadKeyForPhone('+16175551234')).toBe('6175551234')
    expect(threadKeyForPhone('(617) 555-1234')).toBe('6175551234')
  })

  it('falls back to raw digits for short codes', () => {
    expect(threadKeyForPhone('87892')).toBe('87892')
  })

  it('returns null for nothing usable', () => {
    expect(threadKeyForPhone(null)).toBeNull()
    expect(threadKeyForPhone('n/a')).toBeNull()
  })
})

describe('groupInboxThreads', () => {
  it('groups mixed-format numbers into one thread', () => {
    const threads = group({
      messages: [
        msg({ id: 'm1', phone_number: '+16175551234' }),
        msg({ id: 'm2', phone_number: '(617) 555-1234', created_at: '2026-07-20T12:00:00.000Z' }),
      ],
      calls: [call({ phone_number: '6175551234' })],
    })
    expect(threads).toHaveLength(1)
    expect(threads[0].key).toBe('6175551234')
    expect(threads[0].channels.sort()).toEqual(['call', 'sms'])
    expect(threads[0].phone_e164).toBe('+16175551234')
  })

  it('counts unread as inbound-without-read_at plus a new website lead', () => {
    const threads = group({
      messages: [
        msg({ id: 'm1' }), // inbound, unread
        msg({ id: 'm2', direction: 'outbound', read_at: null }), // outbound never counts
        msg({ id: 'm3', read_at: '2026-07-20T10:30:00.000Z' }), // read
      ],
      calls: [call({})], // missed inbound, unread
      quoteRequests: [qr({})], // status 'new' adds one
    })
    expect(threads).toHaveLength(1)
    expect(threads[0].unread).toBe(3)
  })

  it('a reviewed website lead merges without adding unread', () => {
    const threads = group({
      messages: [msg({})],
      quoteRequests: [qr({ status: 'reviewed' })],
    })
    expect(threads[0].unread).toBe(1) // just the unread SMS
    expect(threads[0].channels).toContain('website')
    expect(threads[0].lead).toEqual({ kind: 'quote_request', id: 'q1', stage: 'new' })
  })

  it('newest event wins the preview regardless of input order', () => {
    const threads = group({
      messages: [msg({ id: 'm1', message: 'older text', created_at: '2026-07-20T10:00:00.000Z' })],
      calls: [call({ status: 'missed', created_at: '2026-07-21T09:00:00.000Z' })],
    })
    expect(threads[0].preview).toEqual({ type: 'call', direction: 'inbound', text: 'Missed call' })
    expect(threads[0].last_activity_at).toBe('2026-07-21T09:00:00.000Z')
  })

  it('a phone-less website lead becomes its own qr-keyed thread', () => {
    const threads = group({
      quoteRequests: [qr({ client_phone: null, client_name: 'No Phone Nancy' })],
    })
    expect(threads).toHaveLength(1)
    expect(threads[0].key).toBe('qr:q1')
    expect(threads[0].display_name).toBe('No Phone Nancy')
    expect(threads[0].channels).toEqual(['website'])
    expect(threads[0].unread).toBe(1)
  })

  it('resolves display_name from the customers table by phone digits', () => {
    const threads = group({
      messages: [msg({})],
      customers: [{ id: 'cust1', name: 'Bill Smith', phone: '617-555-1234', email: null }],
    })
    expect(threads[0].customer_id).toBe('cust1')
    expect(threads[0].display_name).toBe('Bill Smith')
  })

  it('merges a QR into an existing thread by customer_id when phones differ', () => {
    const threads = group({
      messages: [msg({ customer_id: 'cust1' })],
      customers: [{ id: 'cust1', name: 'Bill Smith', phone: '+16175551234', email: null }],
      quoteRequests: [qr({ client_phone: '999-555-0000', customer_id: 'cust1' })],
    })
    // One thread: the QR joined Bill's SMS thread instead of forking its own.
    expect(threads).toHaveLength(1)
    expect(threads[0].channels.sort()).toEqual(['sms', 'website'])
  })

  it('links an active job as the lead with a mapped stage', () => {
    const threads = group({
      messages: [msg({ customer_id: 'cust1' })],
      customers: [{ id: 'cust1', name: 'Bill Smith', phone: '+16175551234', email: null }],
      jobs: [
        {
          id: 'job1',
          status: 'awaiting_response',
          customer_id: 'cust1',
          client_phone: null,
          client_name: 'Bill Smith',
          title: 'Bathroom remodel',
        } satisfies InboxJobRow,
      ],
    })
    expect(threads[0].lead).toEqual({ kind: 'job', id: 'job1', stage: 'awaiting_response' })
  })

  it('an open QR outranks a job for the lead link', () => {
    const threads = group({
      messages: [msg({ customer_id: 'cust1' })],
      customers: [{ id: 'cust1', name: 'Bill', phone: '+16175551234', email: null }],
      quoteRequests: [qr({ customer_id: 'cust1' })],
      jobs: [
        {
          id: 'job1',
          status: 'scheduled',
          customer_id: 'cust1',
          client_phone: null,
          client_name: 'Bill',
          title: null,
        },
      ],
    })
    expect(threads[0].lead?.kind).toBe('quote_request')
  })

  it('sorts threads by last activity, newest first', () => {
    const threads = group({
      messages: [
        msg({ id: 'm1', phone_number: '+16175551111', created_at: '2026-07-18T10:00:00.000Z' }),
        msg({ id: 'm2', phone_number: '+16175552222', created_at: '2026-07-21T10:00:00.000Z' }),
      ],
    })
    expect(threads.map((t) => t.key)).toEqual(['6175552222', '6175551111'])
  })

  it('unknown numbers produce a thread with no customer, name, or lead', () => {
    const threads = group({ messages: [msg({})] })
    expect(threads[0].customer_id).toBeNull()
    expect(threads[0].display_name).toBeNull()
    expect(threads[0].lead).toBeNull()
  })
})

describe('groupInboxThreads — email channel', () => {
  it('an email from a customer with a phone joins their phone thread', () => {
    const threads = group({
      messages: [msg({})],
      customers: [
        { id: 'cust1', name: 'Jane Doe', phone: '+16175551234', email: 'jane@example.com' },
      ],
      emails: [email({ created_at: '2026-07-22T09:00:00.000Z' })],
    })
    expect(threads).toHaveLength(1)
    expect(threads[0].key).toBe('6175551234')
    expect(threads[0].channels.sort()).toEqual(['email', 'sms'])
    expect(threads[0].unread).toBe(2) // unread SMS + unread email
    expect(threads[0].preview).toEqual({
      type: 'email',
      direction: 'inbound',
      text: 'About my estimate',
    })
  })

  it('an email-only contact gets an em:-keyed thread', () => {
    const threads = group({ emails: [email({})] })
    expect(threads).toHaveLength(1)
    expect(threads[0].key).toBe('em:jane@example.com')
    expect(threads[0].email).toBe('jane@example.com')
    expect(threads[0].channels).toEqual(['email'])
    expect(threads[0].unread).toBe(1)
  })

  it('outbound emails thread by recipient and never count unread', () => {
    const threads = group({
      emails: [
        email({ id: 'e1' }),
        email({
          id: 'e2',
          direction: 'outbound',
          from_email: 'vince@reply.moderntile.pro',
          to_email: 'jane@example.com',
          subject: 'Re: About my estimate',
          created_at: '2026-07-22T10:00:00.000Z',
        }),
      ],
    })
    expect(threads).toHaveLength(1)
    expect(threads[0].unread).toBe(1)
    expect(threads[0].preview.direction).toBe('outbound')
  })

  it('matches the customer by email address when the row is unlinked', () => {
    const threads = group({
      customers: [{ id: 'cust1', name: 'Jane Doe', phone: null, email: 'Jane@Example.com' }],
      emails: [email({})],
    })
    expect(threads[0].customer_id).toBe('cust1')
    expect(threads[0].display_name).toBe('Jane Doe')
    expect(threads[0].key).toBe('em:jane@example.com')
  })
})

describe('threadKeyForEmail', () => {
  it('normalizes to lowercase em: keys', () => {
    expect(threadKeyForEmail(' Jane@Example.COM ')).toBe('em:jane@example.com')
    expect(threadKeyForEmail(null)).toBeNull()
    expect(threadKeyForEmail('')).toBeNull()
  })
})

describe('previewForCall', () => {
  it('labels by status then direction', () => {
    expect(previewForCall({ status: 'voicemail', direction: 'inbound' })).toBe('Voicemail')
    expect(previewForCall({ status: 'missed', direction: 'inbound' })).toBe('Missed call')
    expect(previewForCall({ status: 'completed', direction: 'inbound' })).toBe('Call')
    expect(previewForCall({ status: 'completed', direction: 'outbound' })).toBe('Outgoing call')
  })
})
