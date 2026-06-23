import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'
import { validateContact, sanitize, rateLimit } from '@/lib/validation'
import { createOpenPhoneContact, sendSMS, toE164, AUTO_MESSAGES } from '@/lib/openphone'
import { sendCustomerEmail } from '@/lib/email'

const RESEND_KEY = process.env.RESEND_API_KEY
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'Aguirre Modern Tile <onboarding@resend.dev>'
const TO_EMAIL = process.env.CONTACT_FORM_TO_EMAIL || 'vin@moderntile.pro'
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
    const description = sanitize(body.description || '')
    const projectType = sanitize(body.projectType || '')
    const source = body.source || 'contact'

    // Server-side validation. The quote intake (source='quote') allows a
    // missing email since /api/quotes saved the lead and SMS carries the
    // follow-up; the standalone contact form still requires it.
    const errors = validateContact({ name, email, phone }, { requireEmail: source !== 'quote' })
    if (Object.keys(errors).length > 0) {
      return NextResponse.json({ error: 'Validation failed', details: errors }, { status: 400 })
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

    // Save to Supabase — unless /api/quotes already handled this submission
    if (source !== 'quote' && SUPABASE_URL && SUPABASE_SERVICE_KEY) {
      try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

        let customerId: string | null = null
        let existingOpenPhoneId: string | null = null
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
        if (!customerId && phone) {
          // Match on digits-only (last 10) so format variants of the same
          // number — "(617) 555-1234" vs "6175551234" vs "+16175551234" —
          // resolve to one customer record instead of fragmenting history.
          const phoneDigits = phone.replace(/\D/g, '')
          if (phoneDigits.length >= 10) {
            const last10 = phoneDigits.slice(-10)
            const { data: existing } = await supabase
              .from('customers')
              .select('id, openphone_contact_id, phone')
              .or(`phone.eq.${phone},phone.like.%${last10}`)
              .limit(5)
            const match = existing?.find(
              (row) => (row.phone || '').replace(/\D/g, '').slice(-10) === last10
            )
            if (match) {
              customerId = match.id
              existingOpenPhoneId = match.openphone_contact_id
            }
          }
        }
        if (!customerId) {
          const { data: newCustomer } = await supabase
            .from('customers')
            .insert({
              name,
              email: email || null,
              phone: phone || null,
              source: 'website',
            })
            .select('id')
            .single()
          if (newCustomer) customerId = newCustomer.id
        }

        // Push to OpenPhone so the number shows a name on incoming
        // calls/texts. Awaited so serverless doesn't kill the promise.
        // Own try/catch so OpenPhone outages can't block the form.
        if (customerId && !existingOpenPhoneId) {
          try {
            console.log('[OpenPhone] Attempting to create contact for', name, 'apiKey set:', !!process.env.OPENPHONE_API_KEY)
            const result = await createOpenPhoneContact({
              name,
              email: email || null,
              phone: phone || null,
              source: 'aguirre-tile-website-contact',
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

        const answersWithDescription = {
          ...answers,
          ...(description ? { description } : {}),
        }

        await supabase.from('quote_requests').insert({
          client_name: name,
          client_email: email,
          client_phone: phone,
          project_type: projectType || 'other',
          answers: answersWithDescription,
          status: 'new',
          customer_id: customerId,
        })
      } catch (err) {
        // Non-fatal: email still sends even if DB write fails
        console.error('Contact form Supabase write error:', err)
      }
    }

    const subject =
      source === 'quote'
        ? `New Quote Request: ${projectType || 'Tile Project'} from ${name}`
        : `New Contact Form Submission from ${name}`

    const answerLines = Object.entries(answers)
      .filter(([, v]) => v)
      .map(([k, v]) => `<li><strong>${k}:</strong> ${v}</li>`)
      .join('')

    const html = `
      <h2>${subject}</h2>
      <table style="border-collapse:collapse;width:100%;max-width:600px">
        <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Name</td><td style="padding:8px;border:1px solid #ddd">${name}</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Phone</td><td style="padding:8px;border:1px solid #ddd"><a href="tel:${phone}">${phone}</a></td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Email</td><td style="padding:8px;border:1px solid #ddd"><a href="mailto:${email}">${email}</a></td></tr>
        ${projectType ? `<tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Project Type</td><td style="padding:8px;border:1px solid #ddd">${projectType}</td></tr>` : ''}
        ${description ? `<tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Description</td><td style="padding:8px;border:1px solid #ddd">${description}</td></tr>` : ''}
      </table>
      ${answerLines ? `<h3>Project Details</h3><ul>${answerLines}</ul>` : ''}
      <p style="color:#888;font-size:12px;margin-top:24px">Sent from aguirremoderntile.com contact form</p>
    `

    if (!RESEND_KEY) {
      console.warn(`[Contact] RESEND_API_KEY not set — email NOT sent for ${name} (${email}). Returning demo:true.`)
      return NextResponse.json({ success: true, demo: true })
    }

    const resend = new Resend(RESEND_KEY)

    console.log(`[Contact] Sending lead email via Resend: from=${FROM_EMAIL} to=${TO_EMAIL} replyTo=${email} subject="${subject}"`)
    const sendResult = await resend.emails.send({
      from: FROM_EMAIL,
      to: TO_EMAIL,
      // Only set replyTo when we actually have a customer email (quote leads
      // may not) — an empty replyTo is rejected by Resend.
      replyTo: email || undefined,
      subject,
      html,
    })
    if (sendResult.error) {
      console.error(`[Contact] Resend returned error for ${name}:`, sendResult.error)
      return NextResponse.json({ success: false, error: sendResult.error }, { status: 500 })
    }
    console.log(`[Contact] Lead email sent to ${TO_EMAIL}, Resend id=${sendResult.data?.id}`)

    // Customer confirmation — fire-and-forget. Skip when source='quote'
    // because /api/quotes already fired one for the same submission and
    // we don't want the customer getting two confirmations.
    if (source !== 'quote') {
      const firstName = name.split(' ')[0] || ''
      sendContactConfirmation({ email, phone, firstName, projectType }).catch((err) => {
        console.error('contact confirmation send failed:', err)
      })
    }

    return NextResponse.json({ success: true, email_id: sendResult.data?.id })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Contact API error:', message)
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
  }
}

async function sendContactConfirmation({
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
  if (phone) {
    const e164 = toE164(phone)
    if (e164) {
      await sendSMS(e164, AUTO_MESSAGES.quote_received(firstName)).catch((err) =>
        console.error('quote_received SMS failed:', err)
      )
    }
  }

  if (email) {
    const projectLabel = projectType ? projectType.replace('-', ' ') : 'tile'
    const greeting = firstName ? `Hi ${firstName},` : 'Hi there,'
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111827;">
        <p style="font-size: 16px; margin: 0 0 12px 0;">${greeting}</p>
        <p style="font-size: 16px; line-height: 1.5; margin: 0 0 16px 0;">
          Thanks for reaching out about your ${projectLabel} project — your message came through.
        </p>
        <p style="font-size: 16px; line-height: 1.5; margin: 0 0 16px 0;">
          I'll review the details (and any photos you sent) and put together a written estimate.
          You can expect to hear back within a few hours, usually faster.
        </p>
        <p style="font-size: 16px; line-height: 1.5; margin: 0 0 16px 0;">
          If you remember anything else — special features, timing, photos —
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
      replyTo: process.env.CONTACT_FORM_TO_EMAIL || 'vin@moderntile.pro',
    }).catch((err) => console.error('quote_received email failed:', err))
  }
}
