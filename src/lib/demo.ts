import type { Profile, Job, JobWithAssignee, Invoice, InvoiceWithJob } from '@/lib/supabase/types'

export const isDemoMode = !process.env.NEXT_PUBLIC_SUPABASE_URL

export const demoProfile: Profile = {
  id: 'demo-owner-id',
  email: 'vin@moderntile.pro',
  full_name: 'Vincenzo',
  role: 'owner',
  phone: '(617) 766-1259',
  is_active: true,
  created_at: '2025-01-01T00:00:00Z',
  last_location_lat: 42.4084,
  last_location_lng: -71.0120,
  last_location_updated_at: '2025-02-10T09:30:00Z',
}

const demoLead: Profile = {
  id: 'demo-lead-id',
  email: 'carlos@moderntile.pro',
  full_name: 'Carlos Rivera',
  role: 'lead',
  phone: '(617) 555-0199',
  is_active: true,
  created_at: '2025-01-15T00:00:00Z',
  last_location_lat: 42.3601,
  last_location_lng: -71.0589,
  last_location_updated_at: '2025-02-10T08:45:00Z',
}

export const demoTeamMembers: Profile[] = [demoProfile, demoLead]

// Geocoded coordinates for demo job addresses
export const demoJobCoordinates: Record<string, [number, number]> = {
  'demo-job-1': [42.3554, -71.0640], // 45 Beacon St, Boston
  'demo-job-2': [42.4084, -71.0120], // 12 Oak Ave, Revere
  'demo-job-3': [42.3876, -71.0995], // 88 Central St, Somerville
  'demo-job-4': [42.4268, -71.0660], // 220 Main St, Malden
  'demo-job-5': [42.3736, -71.1097], // 156 Broadway, Cambridge
  'demo-job-6': [42.3471, -71.0840], // 30 Newbury St, Boston
}

export const demoJobs: JobWithAssignee[] = [
  {
    id: 'demo-job-1',
    job_number: 1,
    title: 'Master Bathroom Remodel',
    status: 'in_progress',
    client_name: 'Sarah Johnson',
    client_phone: '(617) 555-1234',
    client_email: 'sarah.j@email.com',
    client_address: '45 Beacon St, Boston, MA 02108',
    job_type: 'Bathroom Tile',
    square_footage: 120,
    scope_notes: 'Full tear-out of existing tile in master bathroom. Install new 12x24 porcelain tile on floors and walls. Includes shower niche with accent mosaic tile. Schluter waterproofing system required.',
    scheduled_start: '2025-02-10',
    scheduled_end: '2025-02-14',
    estimated_days: 5,
    actual_days: null,
    estimated_cost: 8500,
    actual_cost: 6200,
    amount_invoiced: 4250,
    amount_paid: 4250,
    assigned_to: 'demo-lead-id',
    notes: 'Client prefers morning work hours (8am-2pm). Dog will be gated in bedroom. Materials already on site in garage.',
    created_by: 'demo-owner-id',
    created_at: '2025-01-20T10:00:00Z',
    updated_at: '2025-02-08T14:30:00Z',
    assignee: demoLead,
  },
  {
    id: 'demo-job-2',
    job_number: 2,
    title: 'Kitchen Backsplash Install',
    status: 'scheduled',
    client_name: 'Mike Chen',
    client_phone: '(781) 555-8899',
    client_email: 'mike.chen@gmail.com',
    client_address: '12 Oak Ave, Revere, MA 02151',
    job_type: 'Backsplash',
    square_footage: 35,
    scope_notes: 'Install subway tile backsplash from countertop to upper cabinets. White 3x6 subway tile in herringbone pattern. Includes behind range area.',
    scheduled_start: '2025-02-17',
    scheduled_end: '2025-02-18',
    estimated_days: 2,
    actual_days: null,
    estimated_cost: 2800,
    actual_cost: null,
    amount_invoiced: 0,
    amount_paid: 0,
    assigned_to: 'demo-owner-id',
    notes: 'Countertops were just installed last week. Need to be careful with new granite.',
    created_by: 'demo-owner-id',
    created_at: '2025-01-25T09:00:00Z',
    updated_at: '2025-02-01T11:00:00Z',
    assignee: demoProfile,
  },
  {
    id: 'demo-job-3',
    job_number: 3,
    title: 'Shower Tile Repair',
    status: 'lead',
    client_name: 'Emily Rodriguez',
    client_phone: '(617) 555-4567',
    client_email: null,
    client_address: '88 Central St, Somerville, MA 02143',
    job_type: 'Tile Repair',
    square_footage: 40,
    scope_notes: 'Cracked tiles in shower stall (about 6 tiles). Possible water damage behind wall — need to inspect. May require partial re-tile of shower walls.',
    scheduled_start: null,
    scheduled_end: null,
    estimated_days: 3,
    actual_days: null,
    estimated_cost: 1800,
    actual_cost: null,
    amount_invoiced: 0,
    amount_paid: 0,
    assigned_to: null,
    notes: 'Need to schedule site visit to assess water damage extent.',
    created_by: 'demo-owner-id',
    created_at: '2025-02-05T16:00:00Z',
    updated_at: '2025-02-05T16:00:00Z',
    assignee: null,
  },
  {
    id: 'demo-job-4',
    job_number: 4,
    title: 'Entryway Floor Tile',
    status: 'quoted',
    client_name: 'David Park',
    client_phone: '(781) 555-3322',
    client_email: 'dpark@email.com',
    client_address: '220 Main St, Malden, MA 02148',
    job_type: 'Floor Tile',
    square_footage: 65,
    scope_notes: 'Remove vinyl flooring in entryway and install porcelain tile. Large format 24x24 in charcoal gray. Transition strip to hardwood in living room.',
    scheduled_start: '2025-03-03',
    scheduled_end: '2025-03-05',
    estimated_days: 3,
    actual_days: null,
    estimated_cost: 4200,
    actual_cost: null,
    amount_invoiced: 0,
    amount_paid: 0,
    assigned_to: 'demo-lead-id',
    notes: null,
    created_by: 'demo-owner-id',
    created_at: '2025-02-03T13:00:00Z',
    updated_at: '2025-02-06T09:15:00Z',
    assignee: demoLead,
  },
  {
    id: 'demo-job-5',
    job_number: 5,
    title: 'Guest Bathroom Complete',
    status: 'completed',
    client_name: 'Lisa Thompson',
    client_phone: '(617) 555-7788',
    client_email: 'lisa.t@outlook.com',
    client_address: '156 Broadway, Cambridge, MA 02139',
    job_type: 'Bathroom Tile',
    square_footage: 85,
    scope_notes: 'Full tile installation in guest bathroom — floor and tub surround. Marble-look porcelain 12x24 on walls, 2x2 mosaic on floor with linear drain.',
    scheduled_start: '2025-01-27',
    scheduled_end: '2025-01-31',
    estimated_days: 5,
    actual_days: 4,
    estimated_cost: 6800,
    actual_cost: 6400,
    amount_invoiced: 6800,
    amount_paid: 6800,
    assigned_to: 'demo-lead-id',
    notes: 'Job completed on time. Client very happy. Asked for referral card.',
    created_by: 'demo-owner-id',
    created_at: '2025-01-10T08:00:00Z',
    updated_at: '2025-01-31T17:00:00Z',
    assignee: demoLead,
  },
  {
    id: 'demo-job-6',
    job_number: 6,
    title: 'Luxury Shower Remodel',
    status: 'paid',
    client_name: 'Robert Walsh',
    client_phone: '(617) 555-9090',
    client_email: 'rwalsh@email.com',
    client_address: '30 Newbury St, Boston, MA 02116',
    job_type: 'Shower Tile',
    square_footage: 95,
    scope_notes: 'Full custom shower with frameless glass. Large-format marble tile on walls, pebble mosaic floor. Recessed niche, bench seat, and rain shower installation.',
    scheduled_start: '2025-01-13',
    scheduled_end: '2025-01-22',
    estimated_days: 8,
    actual_days: 9,
    estimated_cost: 12000,
    actual_cost: 13200,
    amount_invoiced: 13200,
    amount_paid: 13200,
    assigned_to: 'demo-owner-id',
    notes: 'Took 1 extra day due to plumbing issue behind wall. Client approved change order for additional waterproofing.',
    created_by: 'demo-owner-id',
    created_at: '2024-12-20T10:00:00Z',
    updated_at: '2025-01-24T16:00:00Z',
    assignee: demoProfile,
  },
]

export const demoInvoices: Invoice[] = [
  {
    id: 'demo-inv-1',
    job_id: 'demo-job-1',
    invoice_number: 'INV-2025-001',
    amount: 4250,
    status: 'paid',
    due_date: '2025-02-10',
    stripe_invoice_id: null,
    line_items: [
      { description: 'Tile materials — 12x24 porcelain + mosaic accent', quantity: 1, unit_price: 1800, amount: 1800 },
      { description: 'Schluter waterproofing system', quantity: 1, unit_price: 450, amount: 450 },
      { description: 'Labor — demolition & prep (deposit)', quantity: 2, unit_price: 1000, amount: 2000 },
    ],
    created_at: '2025-01-25T10:00:00Z',
    updated_at: '2025-02-10T09:00:00Z',
  },
  {
    id: 'demo-inv-2',
    job_id: 'demo-job-1',
    invoice_number: 'INV-2025-002',
    amount: 4250,
    status: 'draft',
    due_date: '2025-02-28',
    stripe_invoice_id: null,
    line_items: [
      { description: 'Labor — tile installation (balance)', quantity: 3, unit_price: 1000, amount: 3000 },
      { description: 'Grout, caulk, and finishing materials', quantity: 1, unit_price: 350, amount: 350 },
      { description: 'Shower niche custom work', quantity: 1, unit_price: 900, amount: 900 },
    ],
    created_at: '2025-02-08T14:00:00Z',
    updated_at: '2025-02-08T14:00:00Z',
  },
  {
    id: 'demo-inv-3',
    job_id: 'demo-job-5',
    invoice_number: 'INV-2025-003',
    amount: 6800,
    status: 'paid',
    due_date: '2025-02-14',
    stripe_invoice_id: null,
    line_items: [
      { description: 'Tile materials — marble-look porcelain + mosaic', quantity: 1, unit_price: 2200, amount: 2200 },
      { description: 'Linear drain supply & install', quantity: 1, unit_price: 600, amount: 600 },
      { description: 'Labor — 4 days tile installation', quantity: 4, unit_price: 1000, amount: 4000 },
    ],
    created_at: '2025-01-31T17:00:00Z',
    updated_at: '2025-02-15T10:00:00Z',
  },
  {
    id: 'demo-inv-4',
    job_id: 'demo-job-6',
    invoice_number: 'INV-2025-004',
    amount: 13200,
    status: 'paid',
    due_date: '2025-02-05',
    stripe_invoice_id: null,
    line_items: [
      { description: 'Marble tile — walls (large format)', quantity: 1, unit_price: 3500, amount: 3500 },
      { description: 'Pebble mosaic — shower floor', quantity: 1, unit_price: 800, amount: 800 },
      { description: 'Bench seat & niche fabrication', quantity: 1, unit_price: 1200, amount: 1200 },
      { description: 'Labor — 9 days installation', quantity: 9, unit_price: 850, amount: 7650 },
      { description: 'Change order — additional waterproofing', quantity: 1, unit_price: 50, amount: 50 },
    ],
    created_at: '2025-01-22T16:00:00Z',
    updated_at: '2025-02-06T11:00:00Z',
  },
  {
    id: 'demo-inv-5',
    job_id: 'demo-job-4',
    invoice_number: 'INV-2025-005',
    amount: 4200,
    status: 'sent',
    due_date: '2025-03-01',
    stripe_invoice_id: null,
    line_items: [
      { description: 'Porcelain tile — 24x24 charcoal gray', quantity: 1, unit_price: 1400, amount: 1400 },
      { description: 'Floor prep & vinyl removal', quantity: 1, unit_price: 500, amount: 500 },
      { description: 'Transition strip — tile to hardwood', quantity: 1, unit_price: 300, amount: 300 },
      { description: 'Labor — 3 days installation', quantity: 3, unit_price: 667, amount: 2000 },
    ],
    created_at: '2025-02-06T09:00:00Z',
    updated_at: '2025-02-06T09:00:00Z',
  },
]

export function getDemoJob(id: string): JobWithAssignee | undefined {
  return demoJobs.find((j) => j.id === id)
}

export function getDemoInvoicesForJob(jobId: string): Invoice[] {
  return demoInvoices.filter((inv) => inv.job_id === jobId)
}

export function getDemoInvoice(id: string): InvoiceWithJob | undefined {
  const invoice = demoInvoices.find((inv) => inv.id === id)
  if (!invoice) return undefined
  const job = demoJobs.find((j) => j.id === invoice.job_id) ?? null
  return { ...invoice, job }
}

export function getAllDemoInvoices(): InvoiceWithJob[] {
  return demoInvoices.map((inv) => ({
    ...inv,
    job: demoJobs.find((j) => j.id === inv.job_id) ?? null,
  }))
}
