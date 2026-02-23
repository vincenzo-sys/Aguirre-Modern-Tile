# Aguirre Modern Tile — Next Steps Guide

Last updated: Feb 10, 2026

## Current State

The app is fully functional in **demo mode** — no API keys needed. Everything renders with sample data.

### What's Built
- **Marketing site**: 40+ pages (services, locations, gallery, blog, contact, quote calculator)
- **Dashboard**: Job management with 4 views (List, Kanban, Calendar, Timeline)
- **Financials**: Estimated vs actual cost tracking, budget variance, job performance
- **Invoicing UI**: Create, list, detail views with line items (structure only, no Stripe)
- **Team Map**: Leaflet + OpenStreetMap with team member and job site markers
- **Analytics**: Revenue, budget/days performance, team workload tables
- **Role-based access**: Owner vs Lead permissions, sidebar filtering, status restrictions
- **Auth flow**: Supabase login/signup with middleware-protected dashboard routes
- **Database schema**: Complete SQL with RLS policies (`supabase/schema.sql`)

---

## Priority 1: Go Live (Minimum for Launch)

### 1A. Create Supabase Project
**Time: ~30 min | No code changes needed**

1. Go to [supabase.com](https://supabase.com) → New Project
2. Copy the SQL from `supabase/schema.sql` → run in SQL Editor
3. Create a storage bucket called `job-photos` (private)
4. Copy your keys into `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   NEXT_PUBLIC_SITE_URL=https://aguirremodertile.com
   ```
5. Create first user in Supabase Auth → manually set `role = 'owner'` in profiles table
6. Test: login → create a job → verify it persists

### 1B. Deploy to Vercel
**Time: ~15 min**

1. Push repo to GitHub (if not already)
2. Import project in [vercel.com](https://vercel.com)
3. Add environment variables from `.env.local`
4. Deploy — should work out of the box with Next.js 14
5. Set custom domain (aguirremodertile.com or similar)

### 1C. Google Analytics
**Time: ~10 min**

1. Create GA4 property
2. Add `NEXT_PUBLIC_GA_ID` to env
3. Add GA script to `src/app/layout.tsx` (root layout)

### 1D. Contact Form Email
**Time: ~30 min**

1. `npm install resend`
2. Create API route `src/app/api/contact/route.ts`
3. Wire up the existing contact form to POST to it
4. Sends email to vin@moderntile.pro on submission

---

## Priority 2: Revenue Features

### 2A. Stripe Integration (Invoicing)
**Time: ~2-3 hours**

The invoice UI is built — it just needs a real backend:

1. `npm install stripe @stripe/stripe-js`
2. Add `STRIPE_SECRET_KEY` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` to env
3. Create API routes:
   - `POST /api/invoices` — creates Stripe invoice from line items
   - `POST /api/invoices/[id]/send` — sends invoice via Stripe
   - `POST /api/webhooks/stripe` — handles payment events (updates `amount_paid`)
4. Update "Mark as Sent" / "Mark as Paid" buttons to call real APIs
5. Update `stripe_invoice_id` field on invoice records
6. Add Stripe customer creation on first invoice per client

**Key files to modify:**
- `src/app/(dashboard)/dashboard/invoices/new/page.tsx` (form submit)
- `src/app/(dashboard)/dashboard/invoices/[id]/page.tsx` (action buttons)
- `src/lib/demo.ts` → add Supabase fallback in invoice helpers

### 2B. Quote → Job Pipeline
**Time: ~1-2 hours**

The quote calculator exists but doesn't connect to the dashboard:

1. Create `quotes` table in Supabase (name, email, phone, service, sq_ft, estimated_price)
2. API route `POST /api/quotes` to save submissions
3. Dashboard page `/dashboard/quotes` to view incoming quote requests
4. "Convert to Job" button that pre-fills the new job form

---

## Priority 3: Content Management

### 3A. Payload CMS Setup
**Time: ~3-4 hours**

All marketing content is hardcoded in `.tsx` files. Payload CMS would let you edit without deploys.

**Option A: Payload Cloud (easier)**
1. `npx create-payload-app` in a separate repo or monorepo
2. Define collections: Pages, Services, Blog Posts, Gallery, Testimonials
3. Fetch content via Payload REST API in Next.js pages
4. Deploy Payload to Payload Cloud

**Option B: Payload embedded in Next.js (single deploy)**
1. `npm install payload` + adapter
2. Add Payload config to the Next.js project
3. Uses the same Vercel deployment
4. Content stored in Supabase (Postgres adapter)

**Content to migrate:**
- Service page descriptions and pricing
- Location pages (currently generated from `src/data/locations.ts`)
- Blog posts
- Gallery images
- Testimonials / reviews
- Homepage hero text and CTAs

---

## Priority 4: Claude / MCP Integration

### 4A. MCP Server for Job Management
**Time: ~3-4 hours**

Build an MCP server that lets Claude manage jobs via natural language.

**Architecture:**
```
Claude Desktop / Claude Code
  ↓ MCP Protocol
Your MCP Server (Node.js)
  ↓ Supabase Client
Supabase Database
```

**Setup:**
1. Create `mcp-server/` directory in project
2. `npm init` + `npm install @modelcontextprotocol/sdk @supabase/supabase-js`
3. Define tools (from existing `docs/api-specification.md`):

**Tools to implement:**
| Tool | Description |
|------|-------------|
| `search_jobs` | Find jobs by client name, status, assignee |
| `get_job` | Get full job details by ID or job number |
| `create_job` | Create new job from natural language description |
| `update_job_status` | Move job through pipeline |
| `list_invoices` | Get invoices filtered by status |
| `create_invoice` | Generate invoice for a job |
| `get_schedule` | Show upcoming jobs for a date range |
| `get_analytics` | Revenue, pipeline value, team workload |

**Resources to expose:**
| Resource | Description |
|----------|-------------|
| `jobs://active` | Currently active jobs |
| `team://members` | Team member list with roles |
| `invoices://outstanding` | Unpaid invoices |

4. Add to Claude Desktop config (`claude_desktop_config.json`):
   ```json
   {
     "mcpServers": {
       "aguirre-tile": {
         "command": "node",
         "args": ["path/to/mcp-server/index.js"],
         "env": {
           "SUPABASE_URL": "...",
           "SUPABASE_SERVICE_ROLE_KEY": "..."
         }
       }
     }
   }
   ```

### 4B. AI Quote Assistant
**Time: ~2 hours**

Add a Claude-powered chat widget to the quote page:
1. Create API route `POST /api/chat` using Anthropic SDK
2. System prompt with tile pricing knowledge, service area, availability
3. Can answer questions, help estimate costs, collect info for quote
4. Saves conversation + extracted details to Supabase

---

## Priority 5: Polish

### 5A. SMS Notifications (Twilio)
- Job assigned → text to lead
- Status change → text to owner
- Appointment reminder → text to client

### 5B. Photo Upload Backend
- Wire `PhotoUpload` component to Supabase Storage
- Before/after photo pairs on job detail
- Client-facing photo gallery

### 5C. SEO & Structured Data
- JSON-LD for LocalBusiness, Service, Review schemas
- OpenGraph images for social sharing
- Sitemap generation

### 5D. PWA / Mobile
- Add `manifest.json` for installable app
- Offline support for job list
- Push notifications for job updates

---

## File Reference

| Area | Key Files |
|------|-----------|
| Database | `supabase/schema.sql` |
| Demo data | `src/lib/demo.ts` |
| Types | `src/lib/supabase/types.ts` |
| Auth | `src/middleware.ts`, `src/app/(auth)/login/page.tsx` |
| Dashboard layout | `src/app/(dashboard)/layout.tsx` |
| Job views | `src/components/dashboard/{JobListView,KanbanBoard,CalendarView,TimelineView}.tsx` |
| Invoicing | `src/app/(dashboard)/dashboard/invoices/` |
| Analytics | `src/app/(dashboard)/dashboard/analytics/page.tsx` |
| Team map | `src/components/dashboard/{TeamMap,TeamMapInner}.tsx` |
| Marketing | `src/app/(marketing)/` |
| Quote calc | `src/app/(marketing)/quote/` |
| API spec | `docs/api-specification.md` |

---

## Recommended Build Order

```
Session 1: Supabase + Deploy (1A, 1B)         → Live site with real data
Session 2: Email + Analytics (1C, 1D)          → Contact form works, tracking active
Session 3: Stripe (2A)                         → Real invoicing
Session 4: MCP Server (4A)                     → Claude can manage jobs
Session 5: Payload CMS (3A)                    → Edit content without deploys
Session 6: Quote pipeline + polish (2B, 5A-D)  → Full business workflow
```
