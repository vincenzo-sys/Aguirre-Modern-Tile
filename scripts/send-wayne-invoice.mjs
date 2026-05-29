// Mirrors src/app/api/stripe/route.ts (the 'send' action).
// Reads STRIPE_SECRET_KEY + DATABASE_URI from .env.local, finalizes
// invoice INV-2026-004 on Stripe, and prints the hosted_invoice_url.
import fs from 'node:fs/promises'
import path from 'node:path'
import pg from 'pg'
import Stripe from 'stripe'

const text = await fs.readFile(path.resolve('.env.local'), 'utf8')
for (const line of text.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

const INVOICE_ID = '0405c2d5-9b67-42be-af79-7b22d141e040'

if (!process.env.STRIPE_SECRET_KEY) {
  console.error('STRIPE_SECRET_KEY not set in .env.local')
  process.exit(1)
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
const c = new pg.Client({ connectionString: process.env.DATABASE_URI })
await c.connect()

const { rows: [invoice] } = await c.query(
  `SELECT id, invoice_number, job_id, amount, due_date, line_items, stripe_invoice_id
   FROM invoices WHERE id = $1`,
  [INVOICE_ID]
)
if (!invoice) { console.error('Invoice not found'); process.exit(1) }
if (invoice.stripe_invoice_id) {
  console.error(`Invoice already sent to Stripe (id=${invoice.stripe_invoice_id})`)
  process.exit(1)
}

const { rows: [job] } = await c.query(
  `SELECT id, client_name, client_email, client_phone FROM jobs WHERE id = $1`,
  [invoice.job_id]
)
if (!job) { console.error('Job not found'); process.exit(1) }
if (!job.client_email) {
  console.error('Job has no client_email — cannot send invoice.')
  process.exit(1)
}

console.log(`Sending invoice ${invoice.invoice_number} to ${job.client_email} (${job.client_name})...`)

// 1. Find or create Stripe customer
const existing = await stripe.customers.list({ email: job.client_email, limit: 1 })
const customer = existing.data[0] ?? await stripe.customers.create({
  email: job.client_email,
  name: job.client_name,
  phone: job.client_phone ?? undefined,
  metadata: { supabase_job_id: job.id },
})
console.log(`Stripe customer: ${customer.id}`)

// 2. Create Stripe invoice (draft)
const daysUntilDue = Math.max(
  1,
  Math.ceil((new Date(invoice.due_date).getTime() - Date.now()) / 86_400_000)
)
const stripeInvoice = await stripe.invoices.create({
  customer: customer.id,
  collection_method: 'send_invoice',
  days_until_due: daysUntilDue,
  metadata: {
    supabase_invoice_id: invoice.id,
    invoice_number: invoice.invoice_number,
  },
})
console.log(`Stripe invoice created (draft): ${stripeInvoice.id}`)

// 3. Add line items
const lineItems = invoice.line_items ?? []
if (lineItems.length > 0) {
  await stripe.invoices.addLines(stripeInvoice.id, {
    lines: lineItems.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      price_data: {
        currency: 'usd',
        unit_amount: Math.round(Number(item.unit_price) * 100),
        product_data: { name: item.description },
      },
    })),
  })
  console.log(`Added ${lineItems.length} line item(s)`)
}

// 4. Finalize + send
const finalized = await stripe.invoices.finalizeInvoice(stripeInvoice.id)
await stripe.invoices.sendInvoice(finalized.id)
console.log(`Finalized + sent: ${finalized.id}`)

// 5. Update Supabase invoice record
await c.query(
  `UPDATE invoices SET stripe_invoice_id = $1, status = 'sent', updated_at = NOW() WHERE id = $2`,
  [finalized.id, invoice.id]
)
await c.end()

console.log('\n=== DONE ===')
console.log(`stripe_invoice_id : ${finalized.id}`)
console.log(`hosted_invoice_url: ${finalized.hosted_invoice_url}`)
console.log(`invoice_pdf       : ${finalized.invoice_pdf}`)
