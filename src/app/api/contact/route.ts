import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { validateContact, sanitize, rateLimit } from '@/lib/validation'

const RESEND_KEY = process.env.RESEND_API_KEY
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'Aguirre Modern Tile <onboarding@resend.dev>'
const TO_EMAIL = process.env.CONTACT_FORM_TO_EMAIL || 'vin@moderntile.pro'

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
