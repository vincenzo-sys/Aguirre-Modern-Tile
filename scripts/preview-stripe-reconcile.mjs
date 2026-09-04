// READ-ONLY preview of the Stripe -> CRM reconciliation.
//
// Answers "how much money has Stripe actually taken, and how much of it appears
// on a job record right now?" — without writing a single row, deploying
// anything, or contacting anyone.
//
//   npx tsx scripts/preview-stripe-reconcile.mjs
//
// Add --apply to actually credit. That path calls record_deposit (idempotent on
// the Stripe session id) and flips locally-unpaid invoices Stripe reports as
// paid, then recomputes each touched job's rollups. It never creates a job,
// never creates an invoice, and never messages a customer.
//
// It reimplements nothing: it runs the same pure planner the cron at
// /api/cron/stripe-reconcile runs, from src/lib/stripeReconcile.ts.
import fs from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

const text = await fs.readFile(path.resolve('.env.local'), 'utf8')
for (const line of text.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

try {
  register('tsx/esm', import.meta.url)
} catch {
  /* already running under tsx */
}

let planStripeReconciliation,
  applyStripeReconciliation,
  summarizePlan,
  JOB_FIELDS_FOR_RECONCILE,
  INVOICE_FIELDS_FOR_RECONCILE
try {
  // pathToFileURL, not a bare path: on Windows `C:\...` is read as a protocol.
  ;({
    planStripeReconciliation,
    applyStripeReconciliation,
    summarizePlan,
    JOB_FIELDS_FOR_RECONCILE,
    INVOICE_FIELDS_FOR_RECONCILE,
  } = await import(pathToFileURL(path.resolve('src/lib/stripeReconcile.ts')).href))
} catch (err) {
  console.error(
    'Could not load src/lib/stripeReconcile.ts — run `npx tsx scripts/preview-stripe-reconcile.mjs`.\n' +
      String(err?.message ?? err)
  )
  process.exit(1)
}

const APPLY = process.argv.includes('--apply')

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { maxNetworkRetries: 2 })
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function listAll(pageFn, cap = 20) {
  const out = []
  let cursor
  for (let i = 0; i < cap; i++) {
    const res = await pageFn(cursor)
    out.push(...res.data)
    if (!res.has_more || res.data.length === 0) return out
    cursor = res.data[res.data.length - 1].id
  }
  return out
}

const [rawSessions, rawInvoices, rawCharges] = await Promise.all([
  listAll((starting_after) => stripe.checkout.sessions.list({ limit: 100, starting_after })),
  listAll((starting_after) => stripe.invoices.list({ limit: 100, starting_after })),
  listAll((starting_after) => stripe.charges.list({ limit: 100, starting_after })),
])

const refundedByIntent = new Map()
let accountRefundTotal = 0
for (const charge of rawCharges) {
  const refunded = Number(charge.amount_refunded ?? 0) / 100
  if (refunded <= 0) continue
  accountRefundTotal += refunded
  const intent =
    typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id
  if (!intent) continue
  refundedByIntent.set(intent, (refundedByIntent.get(intent) ?? 0) + refunded)
}

const sessions = rawSessions.map((s) => {
  const intent = typeof s.payment_intent === 'string' ? s.payment_intent : s.payment_intent?.id
  return {
    id: s.id,
    amount_total: (s.amount_total ?? 0) / 100,
    payment_status: s.payment_status,
    created: s.created,
    job_id: s.metadata?.job_id ?? null,
    type: s.metadata?.type ?? null,
    customer_email: s.customer_details?.email ?? null,
    amount_refunded: intent ? refundedByIntent.get(intent) ?? 0 : 0,
  }
})

const stripeInvoices = rawInvoices.map((i) => ({
  id: i.id,
  status: i.status ?? null,
  amount_paid: Number(i.amount_paid ?? 0) / 100,
  amount_due: Number(i.amount_due ?? 0) / 100,
  number: i.number ?? null,
  customer_email: i.customer_email ?? null,
  created: i.created,
  hosted_invoice_url: i.hosted_invoice_url ?? null,
}))

const [{ data: jobs }, { data: localInvoices }, { data: ledger }] = await Promise.all([
  supabase.from('jobs').select(JOB_FIELDS_FOR_RECONCILE).limit(2000),
  supabase.from('invoices').select(INVOICE_FIELDS_FOR_RECONCILE).limit(2000),
  supabase.from('processed_deposit_sessions').select('session_id, job_id, amount').limit(2000),
])

const plan = planStripeReconciliation({
  sessions,
  stripeInvoices,
  jobs: jobs ?? [],
  localInvoices: localInvoices ?? [],
  ledger: ledger ?? [],
  accountRefundTotal,
})

const usd = (n) => '$' + Number(n).toFixed(2).padStart(9)
const day = (t) => new Date(t * 1000).toISOString().slice(0, 10)

console.log('')
console.log('STRIPE -> CRM RECONCILIATION' + (APPLY ? '  [APPLY]' : '  [DRY RUN — nothing written]'))
console.log('='.repeat(78))
console.log(summarizePlan(plan))
console.log('')

console.log(`DEPOSITS TO CREDIT (${plan.deposits.length})`)
for (const d of plan.deposits) {
  console.log(`  ${day(d.created)}  ${usd(d.amount)}  #${d.job_number ?? '?'} ${d.client_name ?? ''}`)
}
if (!plan.deposits.length) console.log('  (none)')
console.log('')

console.log(`INVOICES TO MARK PAID (${plan.invoiceFixes.length})`)
for (const f of plan.invoiceFixes) {
  console.log(`  ${usd(f.amount)}  ${f.invoice_number ?? f.stripe_invoice_id}  ${f.from_status} -> ${f.to_status}`)
}
if (!plan.invoiceFixes.length) console.log('  (none)')
console.log('')

console.log(`UNATTRIBUTABLE — NEEDS A HUMAN (${plan.orphans.length}, ${usd(plan.totals.unattributable).trim()})`)
for (const o of plan.orphans) {
  console.log(`  ${day(o.created)}  ${usd(o.amount)}  ${o.reason}`)
  console.log(`      ${o.customer_email ?? '(no email)'}  ${o.stripe_id}`)
  console.log(`      ${o.detail}`)
}
if (!plan.orphans.length) console.log('  (none)')
console.log('')

const crmPaid = (jobs ?? []).reduce((sum, j) => sum + Number(j.amount_paid ?? 0), 0)
const stripeCash = plan.totals.stripeSessionCash + plan.totals.stripeInvoiceCash
console.log('LEDGER CHECK')
console.log(`  Stripe cash, all-time        ${usd(stripeCash)}`)
console.log(`  CRM jobs.amount_paid total   ${usd(crmPaid)}`)
console.log(`  Gap                          ${usd(stripeCash - crmPaid)}`)
console.log(`  Already ledgered             ${usd(plan.alreadyCredited)}`)
if (plan.totals.refundsNotModelled > 0) {
  console.log(`  Invoice refunds NOT modelled ${usd(plan.totals.refundsNotModelled)}  <- gross overstates net by this much`)
}
console.log('')

if (!APPLY) {
  console.log('Dry run. Re-run with --apply to credit the deposits above.')
  process.exit(0)
}

const applied = await applyStripeReconciliation(supabase, plan)
console.log('APPLIED')
console.log(`  credited        ${applied.credited.length}`)
console.log(`  skipped (dupe)  ${applied.skipped.length}`)
console.log(`  invoices fixed  ${applied.invoicesFixed.length}`)
console.log(`  jobs recomputed ${applied.jobsRecomputed.length}`)
if (applied.errors.length) {
  console.log('  ERRORS:')
  applied.errors.forEach((e) => console.log(`    ${e.stripe_id}: ${e.message}`))
  process.exit(1)
}
