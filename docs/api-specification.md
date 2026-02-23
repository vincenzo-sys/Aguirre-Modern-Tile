# Aguirre Modern Tile - Custom System API Specification

This document outlines all the API endpoints your custom system would expose, allowing your Claude Tile Estimation project to take real actions.

---

## Authentication

All API calls require an API key in the header:
```
Authorization: Bearer your-api-key-here
```

---

## Customer Management

### Create Customer
```
POST /api/customers
```
**Request:**
```json
{
  "name": "John Smith",
  "email": "john@example.com",
  "phone": "555-123-4567",
  "address": "123 Main St, Phoenix, AZ 85001",
  "source": "website" | "referral" | "repeat"
}
```
**Response:**
```json
{
  "id": "cust_abc123",
  "name": "John Smith",
  "created_at": "2025-01-31T12:00:00Z"
}
```

### Get Customer
```
GET /api/customers/{customer_id}
```
**Response:**
```json
{
  "id": "cust_abc123",
  "name": "John Smith",
  "email": "john@example.com",
  "phone": "555-123-4567",
  "address": "123 Main St, Phoenix, AZ 85001",
  "total_jobs": 3,
  "total_spent": 12500.00,
  "jobs": [
    {
      "id": "job_xyz789",
      "title": "Kitchen Backsplash",
      "status": "completed",
      "total": 2400.00,
      "completed_date": "2024-08-15"
    }
  ]
}
```

### Search Customers
```
GET /api/customers/search?q=john
```
Use this when Claude needs to find a customer by name, email, or phone.

---

## Estimates & Quotes

### Create Estimate
```
POST /api/estimates
```
**Request:**
```json
{
  "customer_id": "cust_abc123",
  "title": "Master Bathroom Remodel",
  "notes": "Customer wants modern look, white/gray tones",
  "line_items": [
    {
      "description": "Porcelain Floor Tile - 12x24 Grigio",
      "quantity": 150,
      "unit": "sq ft",
      "unit_price": 8.50,
      "total": 1275.00
    },
    {
      "description": "Tile Installation - Floor",
      "quantity": 150,
      "unit": "sq ft",
      "unit_price": 12.00,
      "total": 1800.00
    },
    {
      "description": "Schluter Trim",
      "quantity": 24,
      "unit": "linear ft",
      "unit_price": 15.00,
      "total": 360.00
    }
  ],
  "subtotal": 3435.00,
  "tax_rate": 0.056,
  "tax": 192.36,
  "total": 3627.36,
  "valid_until": "2025-02-28",
  "deposit_required": true,
  "deposit_percent": 50
}
```
**Response:**
```json
{
  "id": "est_def456",
  "status": "draft",
  "view_url": "https://portal.aguirretile.com/estimates/est_def456",
  "created_at": "2025-01-31T12:00:00Z"
}
```

### Send Estimate to Customer
```
POST /api/estimates/{estimate_id}/send
```
**Request:**
```json
{
  "send_email": true,
  "send_sms": true,
  "message": "Hi John, here's your estimate for the bathroom project. Let me know if you have any questions!"
}
```
**Response:**
```json
{
  "sent": true,
  "email_sent": true,
  "sms_sent": true
}
```

### Convert Estimate to Job
```
POST /api/estimates/{estimate_id}/convert
```
This creates a job from an approved estimate.

---

## Jobs / Projects

### Create Job
```
POST /api/jobs
```
**Request:**
```json
{
  "customer_id": "cust_abc123",
  "estimate_id": "est_def456",
  "title": "Master Bathroom Remodel",
  "scheduled_start": "2025-02-15",
  "estimated_duration_days": 5,
  "notes": "Access through garage. Dog in backyard.",
  "line_items": [...],
  "total": 3627.36
}
```

### Update Job Status
```
PATCH /api/jobs/{job_id}
```
**Request:**
```json
{
  "status": "scheduled" | "in_progress" | "completed" | "on_hold",
  "notes": "Completed day 1, demo and floor prep done"
}
```

### Add Photos to Job
```
POST /api/jobs/{job_id}/photos
```
**Request:**
```json
{
  "photos": [
    {
      "url": "https://...",
      "caption": "Before - existing tile",
      "type": "before" | "progress" | "after"
    }
  ]
}
```

### Get Job Details
```
GET /api/jobs/{job_id}
```
Returns full job info including customer, line items, photos, payments, notes.

---

## Invoices & Payments

### Create Invoice
```
POST /api/invoices
```
**Request:**
```json
{
  "customer_id": "cust_abc123",
  "job_id": "job_xyz789",
  "type": "deposit" | "progress" | "final",
  "line_items": [
    {
      "description": "50% Deposit - Master Bathroom Remodel",
      "amount": 1813.68
    }
  ],
  "subtotal": 1813.68,
  "tax": 0,
  "total": 1813.68,
  "due_date": "2025-02-10",
  "notes": "Thank you for choosing Aguirre Modern Tile!"
}
```
**Response:**
```json
{
  "id": "inv_ghi789",
  "status": "pending",
  "payment_url": "https://portal.aguirretile.com/pay/inv_ghi789",
  "stripe_invoice_id": "in_1abc...",
  "created_at": "2025-01-31T12:00:00Z"
}
```

### Send Invoice
```
POST /api/invoices/{invoice_id}/send
```
**Request:**
```json
{
  "send_email": true,
  "send_sms": true,
  "message": "Hi John, your deposit invoice is ready. Click the link to pay securely online."
}
```

### Check Payment Status
```
GET /api/invoices/{invoice_id}
```
**Response:**
```json
{
  "id": "inv_ghi789",
  "status": "paid",
  "paid_at": "2025-01-31T15:30:00Z",
  "payment_method": "card",
  "amount_paid": 1813.68
}
```

### Get Outstanding Invoices
```
GET /api/invoices?status=pending
```
Claude can use this to check who owes money.

---

## Communications

### Send Message
```
POST /api/messages
```
**Request:**
```json
{
  "customer_id": "cust_abc123",
  "channels": ["email", "sms"],
  "subject": "Quick update on your project",
  "message": "Hi John, just wanted to let you know we'll be starting at 8am tomorrow. See you then!"
}
```

### Get Conversation History
```
GET /api/customers/{customer_id}/messages
```
Returns all messages sent to/from this customer.

---

## Scheduling

### Get Available Dates
```
GET /api/schedule/availability?start=2025-02-01&end=2025-02-28
```
**Response:**
```json
{
  "available_dates": ["2025-02-10", "2025-02-11", "2025-02-17", "2025-02-18"],
  "busy_dates": [
    {
      "date": "2025-02-15",
      "job": "Kitchen - Smith Residence"
    }
  ]
}
```

### Schedule Site Visit / Estimate
```
POST /api/schedule/visits
```
**Request:**
```json
{
  "customer_id": "cust_abc123",
  "date": "2025-02-05",
  "time": "10:00",
  "type": "estimate" | "follow_up",
  "address": "123 Main St, Phoenix, AZ 85001",
  "notes": "Gate code: 1234"
}
```

---

## Materials & Pricing (Optional)

### Search Materials
```
GET /api/materials/search?q=porcelain
```
**Response:**
```json
{
  "materials": [
    {
      "id": "mat_001",
      "name": "Porcelain Floor Tile - 12x24 Grigio",
      "cost": 4.25,
      "price": 8.50,
      "unit": "sq ft",
      "supplier": "Arizona Tile"
    }
  ]
}
```

### Get Labor Rates
```
GET /api/pricing/labor
```
**Response:**
```json
{
  "rates": [
    { "type": "floor_install", "price": 12.00, "unit": "sq ft" },
    { "type": "wall_install", "price": 14.00, "unit": "sq ft" },
    { "type": "backsplash", "price": 18.00, "unit": "sq ft" },
    { "type": "shower_pan", "price": 850.00, "unit": "each" }
  ]
}
```

---

## Reports (for Claude to pull data)

### Revenue Summary
```
GET /api/reports/revenue?period=month
```

### Jobs Summary
```
GET /api/reports/jobs?status=completed&period=month
```

### Customer Acquisition
```
GET /api/reports/customers?period=quarter
```

---

## Claude Tool Definitions

Here's how you'd define these as tools in your Claude Project:

```json
{
  "tools": [
    {
      "name": "search_customer",
      "description": "Search for a customer by name, email, or phone number",
      "input_schema": {
        "type": "object",
        "properties": {
          "query": {
            "type": "string",
            "description": "Name, email, or phone to search for"
          }
        },
        "required": ["query"]
      }
    },
    {
      "name": "create_estimate",
      "description": "Create a new estimate/quote for a customer",
      "input_schema": {
        "type": "object",
        "properties": {
          "customer_id": { "type": "string" },
          "title": { "type": "string" },
          "line_items": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "description": { "type": "string" },
                "quantity": { "type": "number" },
                "unit": { "type": "string" },
                "unit_price": { "type": "number" }
              }
            }
          },
          "deposit_percent": { "type": "number" }
        },
        "required": ["customer_id", "title", "line_items"]
      }
    },
    {
      "name": "send_invoice",
      "description": "Create and send an invoice to a customer",
      "input_schema": {
        "type": "object",
        "properties": {
          "customer_id": { "type": "string" },
          "job_id": { "type": "string" },
          "type": { "type": "string", "enum": ["deposit", "progress", "final"] },
          "amount": { "type": "number" },
          "send_sms": { "type": "boolean" },
          "send_email": { "type": "boolean" }
        },
        "required": ["customer_id", "amount"]
      }
    },
    {
      "name": "get_customer_history",
      "description": "Get a customer's job history, past invoices, and communication log",
      "input_schema": {
        "type": "object",
        "properties": {
          "customer_id": { "type": "string" }
        },
        "required": ["customer_id"]
      }
    },
    {
      "name": "check_availability",
      "description": "Check available dates for scheduling a job or site visit",
      "input_schema": {
        "type": "object",
        "properties": {
          "start_date": { "type": "string", "format": "date" },
          "end_date": { "type": "string", "format": "date" }
        },
        "required": ["start_date", "end_date"]
      }
    },
    {
      "name": "schedule_visit",
      "description": "Schedule a site visit or estimate appointment",
      "input_schema": {
        "type": "object",
        "properties": {
          "customer_id": { "type": "string" },
          "date": { "type": "string", "format": "date" },
          "time": { "type": "string" },
          "address": { "type": "string" },
          "notes": { "type": "string" }
        },
        "required": ["customer_id", "date", "time", "address"]
      }
    },
    {
      "name": "send_message",
      "description": "Send an email and/or SMS to a customer",
      "input_schema": {
        "type": "object",
        "properties": {
          "customer_id": { "type": "string" },
          "message": { "type": "string" },
          "send_email": { "type": "boolean" },
          "send_sms": { "type": "boolean" }
        },
        "required": ["customer_id", "message"]
      }
    }
  ]
}
```

---

## Example Claude Conversation Flow

**You:** "I just talked to Maria Garcia about her kitchen backsplash. 45 square feet of subway tile, $15/sq ft for material, $18/sq ft for labor. She wants to move forward."

**Claude:**
1. Calls `search_customer` → finds Maria Garcia
2. Calls `create_estimate` → creates the quote
3. Calls `send_invoice` with type "deposit" → sends 50% deposit request
4. Responds: "Done! I've created the estimate for Maria's kitchen backsplash ($1,485 total) and sent her a deposit invoice for $742.50. She'll get an email and text with the payment link."

---

## Tech Stack Recommendation

| Component | Technology | Why |
|-----------|------------|-----|
| **Frontend** | Next.js (this site) | Already built, add portal pages |
| **Backend/API** | Next.js API Routes | Keep it simple, one codebase |
| **Database** | PostgreSQL (Supabase) | Free tier, real-time, auth built-in |
| **Payments** | Stripe | Industry standard, great APIs |
| **Email** | Resend | Simple, cheap, great deliverability |
| **SMS** | Twilio | Reliable, pay-per-message |
| **Hosting** | Vercel | Perfect for Next.js |
| **File Storage** | Cloudflare R2 or S3 | For photos |

---

## Estimated Costs (Monthly)

| Service | Cost |
|---------|------|
| Vercel Pro | $20 |
| Supabase (Free tier) | $0 |
| Domain | ~$1 (annual spread) |
| Resend | $0-20 |
| Twilio SMS | ~$5-15 (usage based) |
| Stripe | 2.9% + $0.30 per transaction |
| Cloudflare R2 | ~$0-5 |
| **Total** | **~$25-60/month** + Stripe fees |

Compare this to ServiceTitan at $200+/month!
