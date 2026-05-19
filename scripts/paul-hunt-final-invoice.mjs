// Paul Hunt (job #64): close out for final invoice send.
//   1. Capture customer email Vince just supplied
//   2. Log the deposit Paul paid outside Stripe ($371.90) on jobs.amount_paid
//      so dashboard payment totals are accurate
//   3. Create the final invoice for the balance ($3,547.10) in draft state
//      ready for Vince to send via the dashboard's Stripe action
//
// We DO NOT call /api/stripe here — that route does cookie-session auth
// (not API key), and the customer-facing send-via-Stripe action lives on
// the dashboard invoice detail page. This script only writes the DB rows
// the dashboard reads from.

import fs from 'node:fs/promises'
import path from 'node:path'
import pg from 'pg'

const JOB_ID = 'b2bbf0a3-e756-48e5-876d-215c8785a675'
const CUSTOMER_ID = '12dc64b4-2e65-4efd-b7b6-c86cab8d2413'
const EMAIL = 'phuntjr@comcast.net'
const DEPOSIT_PAID = 371.90 // 10% of original $3,719 quoted total
const NEW_TOTAL = 3919.00 // After $150 tile + $50 metal edge
const BALANCE = Number((NEW_TOTAL - DEPOSIT_PAID).toFixed(2))

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
  try {
    await db.query('BEGIN')

    // ── 1. Add email to Paul's customer record ────────────────────────
    const beforeCust = await db.query(`SELECT email FROM customers WHERE id = $1`, [CUSTOMER_ID])
    if (!beforeCust.rows[0].email) {
      await db.query(`UPDATE customers SET email = $1 WHERE id = $2`, [EMAIL, CUSTOMER_ID])
      console.log('[1/4] Email set: ' + EMAIL)
    } else {
      console.log('[1/4] Email already on record: ' + beforeCust.rows[0].email)
    }

    // ── 2. Log the deposit on jobs.amount_paid ────────────────────────
    const beforeJob = await db.query(`SELECT amount_paid FROM jobs WHERE id = $1`, [JOB_ID])
    if (Number(beforeJob.rows[0].amount_paid) < DEPOSIT_PAID) {
      await db.query(`UPDATE jobs SET amount_paid = $1 WHERE id = $2`, [DEPOSIT_PAID, JOB_ID])
      console.log('[2/4] Deposit logged: $' + DEPOSIT_PAID.toFixed(2) + ' (was paid outside Stripe flow)')
    } else {
      console.log('[2/4] amount_paid already ≥ $' + DEPOSIT_PAID + ' — not overwriting')
    }

    // ── 3. Refuse to double-create the invoice ────────────────────────
    const existing = await db.query(`SELECT id, invoice_number FROM invoices WHERE job_id = $1`, [JOB_ID])
    if (existing.rowCount > 0) {
      await db.query('ROLLBACK')
      console.log('Invoice already exists on this job:', existing.rows[0])
      return
    }

    // ── 4. Mint INV-YYYY-NNN ──────────────────────────────────────────
    const year = new Date().getFullYear()
    const { rows: countRows } = await db.query(`SELECT count(*)::int AS n FROM invoices`)
    const num = (Number(countRows[0].n) + 1).toString().padStart(3, '0')
    const invoiceNumber = `INV-${year}-${num}`

    // ── 5. Build invoice line items (clean, customer-readable) ────────
    const today = new Date()
    const dueDate = new Date(today)
    dueDate.setDate(dueDate.getDate() + 14) // 14-day terms for final invoice
    const dueIso = dueDate.toISOString().slice(0, 10)

    const invoiceLineItems = [
      {
        category: 'project',
        description: 'Tub Surround tile project (90 sf walls, customer-supplied tile, 3-year installation warranty)',
        quantity: 1,
        unit: 'project',
        unit_price: NEW_TOTAL,
        amount: NEW_TOTAL,
      },
      {
        category: 'payment',
        description: 'Less: deposit received (paid prior to install)',
        quantity: 1,
        unit: 'credit',
        unit_price: -DEPOSIT_PAID,
        amount: -DEPOSIT_PAID,
      },
    ]

    // ── 6. Insert the invoice (status 'draft' — Vince finalizes from UI) ─
    const inv = await db.query(
      `INSERT INTO invoices (job_id, customer_id, invoice_number, amount, status, due_date, line_items)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
       RETURNING id, invoice_number, amount, due_date, status`,
      [JOB_ID, CUSTOMER_ID, invoiceNumber, BALANCE, 'draft', dueIso, JSON.stringify(invoiceLineItems)]
    )
    console.log('[3/4] Invoice created: ' + inv.rows[0].invoice_number + ' — $' + Number(inv.rows[0].amount).toFixed(2) + ' due ' + inv.rows[0].due_date.toISOString().slice(0, 10))

    // ── 7. Update jobs.amount_invoiced ────────────────────────────────
    await db.query(`UPDATE jobs SET amount_invoiced = $1 WHERE id = $2`, [BALANCE, JOB_ID])
    console.log('[4/4] jobs.amount_invoiced set to $' + BALANCE.toFixed(2))

    await db.query('COMMIT')

    console.log('\n========================================')
    console.log('READY FOR YOU TO SEND FROM DASHBOARD')
    console.log('  Job:           #64 — Paul Hunt')
    console.log('  Email:         ' + EMAIL)
    console.log('  Project total: $' + NEW_TOTAL.toFixed(2))
    console.log('  Deposit paid:  $' + DEPOSIT_PAID.toFixed(2))
    console.log('  Balance owed:  $' + BALANCE.toFixed(2))
    console.log('  Invoice:       ' + inv.rows[0].invoice_number + ' (draft)')
    console.log('  Due date:      ' + dueIso + ' (14-day terms)')
    console.log('  Dashboard:     /dashboard/invoices/' + inv.rows[0].id)
    console.log('  Next step:     Open the invoice → "Send via Stripe" button')
    console.log('========================================')
  } catch (e) {
    await db.query('ROLLBACK')
    throw e
  } finally {
    await db.end()
  }
}

main().catch((err) => {
  console.error('FAILED:', err)
  process.exit(1)
})
