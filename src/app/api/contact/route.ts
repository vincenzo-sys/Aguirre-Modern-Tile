import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

const RESEND_KEY = process.env.RESEND_API_KEY
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'Aguirre Modern Tile <onboarding@resend.dev>'
const TO_EMAIL = process.env.CONTACT_FORM_TO_EMAIL || 'vin@moderntile.pro'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, email, phone, description, projectType, answers, source } = body

    if (!name || !email || !phone) {
      return NextResponse.json({ error: 'Name, email, and phone are required' }, { status: 400 })
    }

    const subject =
      source === 'quote'
        ? `New Quote Request: ${projectType || 'Tile Project'} from ${name}`
        : `New Contact Form Submission from ${name}`

    const answerLines = answers
      ? Object.entries(answers as Record<string, string>)
          .filter(([, v]) => v)
          .map(([k, v]) => `<li><strong>${k}:</strong> ${v}</li>`)
          .join('')
      : ''

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
      // No Resend key — return success so forms still work in dev/demo
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
  } catch (err: any) {
    console.error('Resend error:', err.message)
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
  }
}
