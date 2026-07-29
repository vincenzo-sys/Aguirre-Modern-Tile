import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { validateContact, sanitize, rateLimit } from '@/lib/validation'
import { decideReferralAttribution, leadSourceFor } from '@/lib/referral'
import { createNotionJob } from '@/lib/notion'
import { createOpenPhoneContact, sendSMS, toE164, AUTO_MESSAGES } from '@/lib/openphone'
import { sendCustomerEmail, ownerReplyTo } from '@/lib/email'
import { findCustomerByPhone } from '@/lib/phoneMatch'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export async function POST(req: NextRequest) {
  try {
    // Rate limit: 5 submissions per minute per IP
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const limit = rateLimit(ip, { maxRequests: 5, windowMs: 60_000 })
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a moment and try again.' },
        { status: 429 }
      )
    }

    const body = await req.json()
    const name = sanitize(body.name || '')
    const email = sanitize(body.email || '')
    const phone = sanitize(body.phone || '')
    const projectType = sanitize(body.projectType || '')
    // Referral attribution: a /refer/<code> link stashed this in the browser
    // and ProjectQuoteForm forwarded it. Resolved to a referrer below.
    const referralCode = sanitize(body.referralCode || '')

    // Server-side validation — email optional for the quote intake (name +
    // phone is enough; SMS is the primary follow-up channel).
    const errors = validateContact({ name, email, phone }, { requireEmail: false })
    if (Object.keys(errors).length > 0) {
      return NextResponse.json({ error: 'Validation failed', details: errors }, { status: 400 })
    }

    if (!projectType) {
      return NextResponse.json({ error: 'Project type is required' }, { status: 400 })
    }

    // Sanitize answers
    const rawAnswers = body.answers as Record<string, string> | undefined
    const answers: Record<string, string> = {}
    if (rawAnswers && typeof rawAnswers === 'object') {
      for (const [k, v] of Object.entries(rawAnswers)) {
        if (typeof v === 'string') {
          answers[sanitize(k).slice(0, 100)] = sanitize(v)
        }
      }
    }

    // Save to Supabase if configured
    if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

      // Find or create customer record
      let customerId: string | null = null
      let existingOpenPhoneId: string | null = null
      try {
        // Try email match first
        if (email) {
          const { data: existing } = await supabase
            .from('customers')
            .select('id, openphone_contact_id')
            .ilike('email', email)
            .limit(1)
            .single()
          if (existing) {
            customerId = existing.id
            existingOpenPhoneId = existing.openphone_contact_id
          }
        }

        // Try phone match if no email match. Compare on digits-only so
        // "(617) 555-1234" matches an existing record stored as
        // "6175551234" or "+16175551234" — otherwise the same customer
        // can end up with two records, splitting their job history.
        if (!customerId && phone) {
          const match = await findCustomerByPhone<{
            id: string
            openphone_contact_id: string | null
            phone: string | null
          }>(supabase, phone, 'id, openphone_contact_id, phone')
          if (match) {
            customerId = match.id
            existingOpenPhoneId = match.openphone_contact_id
          }
        }

        // Create new customer if no match found
        if (!customerId) {
          const { data: newCustomer } = await supabase
            .from('customers')
            .insert({
              name,
              email: email || null,
              phone: phone || null,
              source: leadSourceFor(referralCode),
            })
            .select('id')
            .single()
          if (newCustomer) customerId = newCustomer.id
        }

        // Referral attribution: credit the referrer if the code resolves to a
        // different, not-yet-attributed customer. The decision (self-referral,
        // already-attributed, etc.) lives in decideReferralAttribution so it
        // can be unit-tested; here we just supply the two DB lookups it needs.
        if (referralCode && customerId) {
          const { data: referrer } = await supabase
            .from('customers')
            .select('id')
            .eq('referral_code', referralCode)
            .single()
          const { data: current } = referrer
            ? await supabase
                .from('customers')
                .select('referred_by_customer_id')
                .eq('id', customerId)
                .single()
            : { data: null }
          const decision = decideReferralAttribution({
            referralCode,
            customerId,
            referrerId: referrer?.id ?? null,
            currentReferredBy: current?.referred_by_customer_id ?? null,
          })
          if (decision.attribute) {
            await supabase
              .from('customers')
              .update({ referred_by_customer_id: decision.referrerId })
              .eq('id', customerId)
          }
        }
      } catch (err) {
        // Non-fatal: quote still saves even if customer creation fails
        console.error('Customer find-or-create error:', err)
      }

      // Push to OpenPhone (quo) as a named contact so incoming calls/
      // texts show "Jane Doe" instead of an unknown number. Awaited so
      // Vercel doesn't kill the promise when the function returns.
      // Own try/catch so OpenPhone outages can't block form submission.
      if (customerId && !existingOpenPhoneId) {
        try {
          console.log('[OpenPhone] Attempting to create contact for', name, 'apiKey set:', !!process.env.OPENPHONE_API_KEY)
          const result = await createOpenPhoneContact({
            name,
            email: email || null,
            phone: phone || null,
            source: 'aguirre-tile-website-quote',
          })
          console.log('[OpenPhone] Result:', result)
          if (result.success && result.contactId) {
            await supabase
              .from('customers')
              .update({ openphone_contact_id: result.contactId })
              .eq('id', customerId)
          }
        } catch (err) {
          console.error('[OpenPhone] sync error (non-fatal):', err)
        }
      }

      const { data, error } = await supabase
        .from('quote_requests')
        .insert({
          client_name: name,
          client_email: email,
          client_phone: phone,
          project_type: projectType,
          answers,
          status: 'new',
          customer_id: customerId,
        })
        .select('id')
        .single()

      if (error) {
        console.error('Quote request save error:', error.message)
      }

      // Create a page in Notion's Tile Jobs Dashboard (non-blocking)
      if (process.env.NOTION_API_TOKEN) {
        const notionJobType: Record<string, string> = {
          bathroom: 'Bathroom',
          shower: 'Bathroom',
          'kitchen-floor': 'Kitchen',
          backsplash: 'Backsplash',
          other: 'Other',
        }
        const answersText = Object.entries(answers)
          .filter(([, v]) => v)
          .map(([k, v]) => `${k}: ${v}`)
          .join('\n')

        createNotionJob({
          jobName: `${name} - ${projectType.replace('-', ' ')} (Website Lead)`,
          clientName: name,
          clientEmail: email,
          clientPhone: phone,
          jobType: notionJobType[projectType] ?? 'Other',
          scopeSummary: answersText || undefined,
          leadSource: 'Other', // Website lead
        }).catch((err) => {
          console.error('Notion page creation error:', err)
        })
      }

      // Customer confirmation — fire-and-forget so a Resend or OpenPhone
      // outage doesn't fail the form. Closes the silence between submit and
      // Vince's first reply, which is the biggest single drop-off point.
      const firstName = name.split(' ')[0] || ''
      sendQuoteConfirmation({ email, phone, firstName, projectType }).catch((err) => {
        console.error('quote confirmation send failed:', err)
      })

      return NextResponse.json({ success: true, id: data?.id })
    }

    return NextResponse.json({ success: true, demo: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Quote API error:', message)
    return NextResponse.json({ error: 'Failed to save quote request' }, { status: 500 })
  }
}

async function sendQuoteConfirmation({
  email,
  phone,
  firstName,
  projectType,
}: {
  email: string
  phone: string
  firstName: string
  projectType: string
}) {
  // SMS first — most reliably read, lowest friction.
  if (phone) {
    const e164 = toE164(phone)
    if (e164) {
      await sendSMS(e164, AUTO_MESSAGES.quote_received(firstName)).catch((err) =>
        console.error('quote_received SMS failed:', err)
      )
    }
  }

  if (email) {
    const projectLabel = projectType.replace('-', ' ')
    const greeting = firstName ? `Hi ${firstName},` : 'Hi there,'
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111827;">
        <p style="font-size: 16px; margin: 0 0 12px 0;">${greeting}</p>
        <p style="font-size: 16px; line-height: 1.5; margin: 0 0 16px 0;">
          Thanks for reaching out about your ${projectLabel} project — your request came through.
        </p>
        <p style="font-size: 16px; line-height: 1.5; margin: 0 0 16px 0;">
          I'll review the details (and any photos you sent) and put together a written estimate.
          You can expect to hear back from me within a few hours, usually faster.
        </p>
        <p style="font-size: 16px; line-height: 1.5; margin: 0 0 16px 0;">
          If you remember anything else about the project — special features, timing, photos —
          just reply to this email or text me at <a href="tel:+16177661259" style="color:#0284c7;">(617) 766-1259</a>.
        </p>
        <p style="font-size: 16px; margin: 24px 0 4px 0;">— Vince</p>
        <p style="font-size: 13px; color: #6b7280; margin: 0;">Aguirre Modern Tile · Greater Boston</p>
      </div>
    `.trim()
    await sendCustomerEmail({
      to: email,
      subject: 'Got your tile project request — Aguirre Modern Tile',
      html,
      replyTo: ownerReplyTo(),
    }).catch((err) => console.error('quote_received email failed:', err))
  }
}
