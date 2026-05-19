// Send Paul Hunt's draft invoice INV-2026-003 via Stripe.
//
// Mirrors src/app/api/stripe/route.ts (which requires cookie-session
// auth — can't call from script) using the Stripe SDK directly.
//
// IMPORTANT: Stripe rejects negative unit_amount on invoice lines, so
// we net the deposit credit into the project line rather than listing
// it as -$371.90. Same total, customer-readable, Stripe-compatible.
//
// Idempotent: if invoices.stripe_invoice_id is set, exits cleanly.
// If a Stripe draft already exists (from a prior failed run), we
// reuse it rather than creating a new one.

import fs from 'node:fs/promises'
import path from 'node:path'
import pg from 'pg'
import Stripe from 'stripe'

const INVOICE_ID = 'e5eed6a5-33b9-45de-bcb6-73f1196725bd'
const JOB_ID = 'b2bbf0a3-e756-48e5-876d-215c8785a675'
const EMAIL = 'phuntjr@comcast.net'

// Pricing components (canonical — drives both the local invoice line
// items and the Stripe lines so they agree).
const BASE = 3719.00
const TILE = 150.00
const EDGE = 36.00
const DEPOSIT = 371.90
const BALANCE = Number((BASE + TILE + EDGE - DEPOSIT).toFixed(2)) // 3533.10

// 3 positive lines summing to BALANCE. Deposit credit netted into line 1's
// description for transparency without using a negative line.
const POSITIVE_LINES = [
  {
    category: 'project',
    description: `Tub Surround tile project (90 sf walls, customer-supplied tile, 3-year installation warranty) — balance after $${DEPOSIT.toFixed(2)} deposit credit`,
    quantity: 1,
    unit: 'project',
    unit_price: Number((BASE - DEPOSIT).toFixed(2)),
    amount: Number((BASE - DEPOSIT).toFixed(2)),
  },
  {
    category: 'materials',
    description: 'Additional tile — supplemental purchase on top of customer-supplied tile',
    quantity: 1,
    unit: 'ea',
    unit_price: TILE,
    amount: TILE,
  },
  {
    category: 'materials',
    description: 'Metal edge trim profile (Schluter or similar) — clean finish at tile edges and transitions',
    quantity: 1,
    unit: 'ea',
    unit_price: EDGE,
    amount: EDGE,
  },
]

async function loadEnv() {
  const text = await fs.readFile(path.resolve('.env.local'), 'utf8')
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
  }
}

async function main() {
  await loadEnv()
  const db = new pg.Client({ connectionString: process.env.DATABASE_URI, ssl: { rejectUnauthorized: false } })
  await db.connect()
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' })

  try {
    // ── 1. Read local invoice ─────────────────────────────────────────
    const { rows: invRows } = await db.query(
      `SELECT id, invoice_number, amount, status, stripe_invoice_id, due_date
       FROM invoices WHERE id = $1`,
      [INVOICE_ID]
    )
    const invoice = invRows[0]
    if (!invoice) throw new Error('Invoice not found')
    if (invoice.stripe_invoice_id && invoice.status === 'sent') {
      console.log('Already sent. stripe_invoice_id:', invoice.stripe_invoice_id)
      return
    }
    console.log('[1/8] Local invoice ' + invoice.invoice_number + ' — $' + Number(invoice.amount).toFixed(2) + ' (status: ' + invoice.status + ')')

    // ── 2. Rewrite local line_items to positive-only ──────────────────
    await db.query(
      `UPDATE invoices SET line_items = $1::jsonb, amount = $2 WHERE id = $3`,
      [JSON.stringify(POSITIVE_LINES), BALANCE, INVOICE_ID]
    )
    await db.query(`UPDATE jobs SET amount_invoiced = $1 WHERE id = $2`, [BALANCE, JOB_ID])
    console.log('[2/8] Local invoice rewritten to 3 positive lines totaling $' + BALANCE.toFixed(2))

    // ── 3. job.client_email ───────────────────────────────────────────
    const { rows: jobRows } = await db.query(
      `SELECT id, client_name, client_email, client_phone FROM jobs WHERE id = $1`,
      [JOB_ID]
    )
    const job = jobRows[0]
    if (!job.client_email) {
      await db.query(`UPDATE jobs SET client_email = $1 WHERE id = $2`, [EMAIL, JOB_ID])
      job.client_email = EMAIL
    }
    console.log('[3/8] job.client_email confirmed: ' + job.client_email)

    // ── 4. Find or create Stripe customer ─────────────────────────────
    const existing = await stripe.customers.list({ email: job.client_email, limit: 1 })
    const customer = existing.data[0] ?? await stripe.customers.create({
      email: job.client_email,
      name: job.client_name,
      phone: job.client_phone ?? undefined,
      metadata: { supabase_job_id: job.id },
    })
    console.log('[4/8] Stripe customer: ' + customer.id + (existing.data[0] ? ' (existing)' : ' (created)'))

    // ── 5. Find or create Stripe draft invoice ────────────────────────
    // Look for an existing draft on this customer with our supabase_invoice_id
    // metadata; if found, reuse it (recovery from prior failed run).
    const allInvoices = await stripe.invoices.list({ customer: customer.id, status: 'draft', limit: 10 })
    let stripeInvoice = allInvoices.data.find(
      (inv) => inv.metadata?.supabase_invoice_id === invoice.id
    )
    if (stripeInvoice) {
      console.log('[5/8] Reusing existing Stripe draft: ' + stripeInvoice.id)
      // Remove any existing lines (in case of partial prior run)
      const existingLines = await stripe.invoices.listLineItems(stripeInvoice.id, { limit: 50 })
      for (const ln of existingLines.data) {
        await stripe.invoices.removeLines(stripeInvoice.id, { lines: [{ id: ln.id, behavior: 'unassign' }] })
      }
    } else {
      const daysUntilDue = Math.max(
        1,
        Math.ceil((new Date(invoice.due_date).getTime() - Date.now()) / 86400000)
      )
      stripeInvoice = await stripe.invoices.create({
        customer: customer.id,
        collection_method: 'send_invoice',
        days_until_due: daysUntilDue,
        metadata: {
          supabase_invoice_id: invoice.id,
          invoice_number: invoice.invoice_number,
        },
      })
      console.log('[5/8] Stripe invoice created: ' + stripeInvoice.id)
    }

    // ── 6. Add lines (all positive — Stripe accepts) ──────────────────
    await stripe.invoices.addLines(stripeInvoice.id, {
      lines: POSITIVE_LINES.map((li) => ({
        description: li.description,
        quantity: li.quantity,
        price_data: {
          currency: 'usd',
          unit_amount: Math.round(li.unit_price * 100),
          product_data: { name: li.description.slice(0, 250) },
        },
      })),
    })
    console.log('[6/8] Added ' + POSITIVE_LINES.length + ' lines to Stripe invoice')

    // ── 7. Finalize + send ────────────────────────────────────────────
    const finalized = await stripe.invoices.finalizeInvoice(stripeInvoice.id)
    await stripe.invoices.sendInvoice(finalized.id)
    console.log('[7/8] Finalized + sent.')

    // ── 8. Stamp local row ────────────────────────────────────────────
    await db.query(
      `UPDATE invoices SET stripe_invoice_id = $1, status = 'sent' WHERE id = $2`,
      [finalized.id, INVOICE_ID]
    )
    console.log('[8/8] Local DB stamped: status=sent, stripe_invoice_id=' + finalized.id)

    console.log('\n========================================')
    console.log('SENT — Paul Hunt receives the email now')
    console.log('  Invoice:        ' + invoice.invoice_number)
    console.log('  Amount:         $' + BALANCE.toFixed(2))
    console.log('  Recipient:      ' + job.client_email)
    console.log('  Stripe invoice: ' + finalized.id)
    console.log('  Hosted URL:     ' + finalized.hosted_invoice_url)
    console.log('  PDF:            ' + finalized.invoice_pdf)
    console.log('========================================')
  } finally {
    await db.end()
  }
}

main().catch((err) => {
  console.error('FAILED:', err.message || err)
  if (err.raw) console.error('Stripe error detail:', JSON.stringify(err.raw, null, 2))
  process.exit(1)
})
