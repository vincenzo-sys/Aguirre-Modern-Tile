import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'
import { validateContact, sanitize, rateLimit } from '@/lib/validation'
import { createOpenPhoneContact } from '@/lib/openphone'

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

    // Server-side validation
    const errors = validateContact({ name, email, phone })
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
          const { data: existing } = await supabase
            .from('customers')
            .select('id, openphone_contact_id')
            .eq('phone', phone)
            .limit(1)
            .single()
          if (existing) {
            customerId = existing.id
            existingOpenPhoneId = existing.openphone_contact_id
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
      return NextResponse.json({ success: true, demo: true })
    }

    const resend = new Resend(RESEND_KEY)

    await resend.emails.send({
      from: FROM_EMAIL,
      to: TO_EMAIL,
      replyTo: email,
      subject,
      html,
    })

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Contact API error:', message)
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
  }
}
