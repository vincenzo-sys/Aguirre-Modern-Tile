import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { Resend } from 'resend'
import { createServiceClient } from '@/lib/supabase/service'
import { requireApiAuth } from '@/lib/apiAuth'
import { sendSMS, toE164, AUTO_MESSAGES } from '@/lib/openphone'

// POST /api/invoices/[id]/send-link
//
// Texts + emails the customer their branded, payable invoice link
// (/invoices/[public_token]). Mirrors /api/jobs/[id]/send-estimate: generates
// a public_token if the invoice doesn't have one, fires SMS (OpenPhone) and
// email (Resend) when those channels are available, stamps public_link_sent_at.
//
// Body (optional): { sms?: boolean, email?: boolean } — defaults to both.

const CONFIGURED_FROM = process.env.RESEND_FROM_EMAIL || 'Aguirre Modern Tile <onboarding@resend.dev>'
const RESEND_FALLBACK_FROM = 'Aguirre Modern Tile <onboarding@resend.dev>'

function generateToken(): string {
  return randomBytes(18).toString('base64url')
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(amount)
}

function buildEmailHtml(firstName: string, invoiceNumber: string, amount: string, invoiceUrl: string): string {
  const greeting = firstName ? `Hi ${escapeHtml(firstName)},` : 'Hi there,'
  return `<!DOCTYPE html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111;">
    <h2 style="color: #0369a1; margin: 0 0 16px;">Your invoice is ready</h2>
    <p>${greeting}</p>
    <p>Thank you for choosing Aguirre Modern Tile. Invoice <strong>${escapeHtml(invoiceNumber)}</strong> for <strong>${escapeHtml(amount)}</strong> is ready.</p>
    <p style="margin: 24px 0;">
      <a href="${invoiceUrl}" style="background: #0369a1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">View &amp; pay invoice</a>
    </p>
    <p>You can view the full breakdown, download a PDF, or pay online directly from that page (secured by Stripe). Any questions, just reply to this email or text us at (617) 766-1259.</p>
    <p style="color: #555;">Vincenzo Aguirre<br/>Aguirre Modern Tile</p>
    <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;"/>
    <p style="font-size: 12px; color: #888;">Aguirre Modern Tile · Greater Boston · aguirremoderntile.com</p>
  </body>
</html>`
}

interface SendBody {
  sms?: boolean
  email?: boolean
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireApiAuth(req)
  if (unauthorized) return unauthorized

  let body: SendBody = {}
  try {
    body = (await req.json()) as SendBody
  } catch {
    // empty body — both channels default to true
  }
  const wantSms = body.sms !== false
  const wantEmail = body.email !== false

  const { id } = await params
  const supabase = createServiceClient()

  const { data: invoice, error: invErr } = await supabase
    .from('invoices')
    .select('id, invoice_number, amount, public_token, job_id, customer_id')
    .eq('id', id)
    .single()
  if (invErr || !invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  }

  // Pull bill-to contact from the job, then prefer the linked customer record.
  let phone: string | null = null
  let email: string | null = null
  let customerName: string | null = null
  if (invoice.job_id) {
    const { data: job } = await supabase
      .from('jobs')
      .select('client_name, client_phone, client_email')
      .eq('id', invoice.job_id)
      .single()
    if (job) {
      phone = job.client_phone ?? null
      email = job.client_email ?? null
      customerName = job.client_name ?? null
    }
  }
  if (invoice.customer_id) {
    const { data: customer } = await supabase
      .from('customers')
      .select('name, phone, email')
      .eq('id', invoice.customer_id)
      .single()
    if (customer) {
      phone = customer.phone ?? phone
      email = customer.email ?? email
      customerName = customer.name ?? customerName
    }
  }

  // Generate the public token if missing, stamp sent time.
  const updates: Record<string, unknown> = {
    public_link_sent_at: new Date().toISOString(),
  }
  let token = invoice.public_token as string | null
  if (!token) {
    token = generateToken()
    updates.public_token = token
  }
  const { error: updateErr } = await supabase.from('invoices').update(updates).eq('id', id)
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || req.nextUrl.origin
  const invoiceUrl = `${baseUrl}/invoices/${token}`
  const amountStr = formatCurrency(Number(invoice.amount) || 0)
  const firstName = (customerName || '').trim().split(/\s+/)[0] ?? ''

  // ── SMS ──────────────────────────────────────────────────────────────
  let smsResult: { success: boolean; messageId?: string; error?: string } | null = null
  if (wantSms && phone) {
    const smsPhone = toE164(phone)
    if (!smsPhone) {
      smsResult = { success: false, error: 'Phone could not be normalized to E.164' }
    } else {
      const message = AUTO_MESSAGES.invoice_link(firstName, amountStr, invoiceUrl)
      smsResult = await sendSMS(smsPhone, message)
      if (smsResult.success) {
        await supabase.from('message_log').insert({
          customer_id: invoice.customer_id,
          job_id: invoice.job_id,
          phone_number: smsPhone,
          direction: 'outbound',
          message,
          trigger_type: 'invoice_link',
          openphone_message_id: smsResult.messageId ?? null,
          status: 'sent',
        })
      }
    }
  } else if (wantSms && !phone) {
    smsResult = { success: false, error: 'No phone on file' }
  }

  // ── Email ────────────────────────────────────────────────────────────
  let emailResult: { success: boolean; id?: string; error?: string } | null = null
  if (wantEmail && email) {
    if (!process.env.RESEND_API_KEY) {
      emailResult = { success: false, error: 'RESEND_API_KEY not set' }
    } else {
      const resend = new Resend(process.env.RESEND_API_KEY)
      const html = buildEmailHtml(firstName, invoice.invoice_number, amountStr, invoiceUrl)
      const subject = `Your invoice from Aguirre Modern Tile (${invoice.invoice_number})`
      try {
        const sent = await resend.emails.send({ from: CONFIGURED_FROM, to: [email], subject, html })
        if (sent.error) {
          const isDomainErr = /domain is not verified|not allowed/i.test(sent.error.message)
          if (isDomainErr && CONFIGURED_FROM !== RESEND_FALLBACK_FROM) {
            const retry = await resend.emails.send({ from: RESEND_FALLBACK_FROM, to: [email], subject, html })
            emailResult = retry.error
              ? { success: false, error: retry.error.message }
              : { success: true, id: retry.data?.id }
          } else {
            emailResult = { success: false, error: sent.error.message }
          }
        } else {
          emailResult = { success: true, id: sent.data?.id }
        }
      } catch (err) {
        emailResult = { success: false, error: err instanceof Error ? err.message : 'Email failed' }
      }
    }
  } else if (wantEmail && !email) {
    emailResult = { success: false, error: 'No email on file' }
  }

  return NextResponse.json({
    invoice_url: invoiceUrl,
    sms: smsResult,
    email: emailResult,
  })
}
