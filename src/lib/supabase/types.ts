export type UserRole = 'owner' | 'lead'
export type JobStatus = 'lead' | 'quoted' | 'scheduled' | 'in_progress' | 'waiting_for_materials' | 'completed' | 'paid' | 'cancelled'
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'void'
export type CustomerSource = 'website' | 'manual' | 'referral' | 'repeat'

export interface Profile {
  id: string
  email: string
  full_name: string
  role: UserRole
  phone: string | null
  is_active: boolean
  created_at: string
  last_location_lat: number | null
  last_location_lng: number | null
  last_location_updated_at: string | null
}

export interface Customer {
  id: string
  name: string
  email: string | null
  phone: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  notes: string | null
  source: CustomerSource
  stripe_customer_id: string | null
  notion_page_id: string | null
  created_at: string
  updated_at: string
}

export interface CustomerWithStats extends Customer {
  job_count: number
  total_revenue: number
  last_job_date: string | null
}

export interface JobLineItem {
  category: 'materials' | 'labor'
  description: string
  quantity: number
  unit: 'sq ft' | 'hr' | 'ea' | 'ln ft' | 'bag' | 'box'
  unit_price: number
  amount: number
}

export interface Job {
  id: string
  job_number: number
  title: string
  status: JobStatus
  customer_id: string | null
  client_name: string
  client_phone: string | null
  client_email: string | null
  client_address: string | null
  job_type: string | null
  square_footage: number | null
  scope_notes: string | null
  scheduled_start: string | null
  scheduled_end: string | null
  estimated_days: number | null
  actual_days: number | null
  estimated_cost: number | null
  actual_cost: number | null
  amount_invoiced: number | null
  amount_paid: number | null
  line_items: JobLineItem[]
  stripe_customer_id: string | null
  notion_page_id: string | null
  notion_last_synced_at: string | null
  assigned_to: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface JobWithAssignee extends Job {
  assignee?: Profile | null
}

export interface JobWithCustomer extends Job {
  customer?: Customer | null
  assignee?: Profile | null
}

export interface JobPhoto {
  id: string
  job_id: string
  storage_path: string
  file_name: string
  photo_type: string | null
  caption: string | null
  uploaded_by: string | null
  created_at: string
}

export interface InvoiceLineItem {
  description: string
  quantity: number
  unit_price: number
  amount: number
  type?: 'product' | 'service'
  unit?: string
}

export interface Invoice {
  id: string
  job_id: string
  customer_id: string | null
  invoice_number: string
  amount: number
  status: InvoiceStatus
  due_date: string
  stripe_invoice_id: string | null
  line_items: InvoiceLineItem[]
  created_at: string
  updated_at: string
}

export interface InvoiceWithJob extends Invoice {
  job?: Job | null
}

export type QuoteRequestStatus = 'new' | 'reviewed' | 'converted' | 'archived'

export interface QuoteRequest {
  id: string
  status: QuoteRequestStatus
  customer_id: string | null
  client_name: string
  client_email: string
  client_phone: string
  project_type: string
  answers: Record<string, string>
  converted_job_id: string | null
  created_at: string
  updated_at: string
}

// Reference tables for estimation engine
export type MaterialCategory = 'Backer Board' | 'Thinset' | 'Grout' | 'Waterproofing' | 'Shower Pan/Tray' | 'Accessories' | 'Heating' | 'Other'
export type MaterialUnit = 'sq ft/sheet' | 'sq ft/bag' | 'sq ft/roll' | 'per tube' | 'per box' | 'per piece' | 'sq ft'
export type TradeType = 'Plumber' | 'Glass Install' | 'Electrician' | 'General Contractor' | 'Supplier' | 'Other'

export interface MaterialPricing {
  id: string
  item: string
  category: MaterialCategory
  your_cost: number
  markup_percent: number
  price_to_customer: number
  coverage: number
  unit: MaterialUnit
  retail_link: string | null
  notion_page_id: string | null
  created_at: string
  updated_at: string
}

export interface LaborRate {
  id: string
  setting: string
  value: number
  notes: string | null
  notion_page_id: string | null
  created_at: string
  updated_at: string
}

export interface OperatingCost {
  id: string
  setting: string
  value: string
  notes: string | null
  notion_page_id: string | null
  created_at: string
  updated_at: string
}

export interface AddOn {
  id: string
  item: string
  price_to_customer: number
  notes: string | null
  notion_page_id: string | null
  created_at: string
  updated_at: string
}

export interface JobTemplate {
  id: string
  template_name: string
  job_type: string
  base_price_low: number | null
  base_price_high: number | null
  typical_sqft_low: number | null
  typical_sqft_high: number | null
  demo_days: number | null
  install_days: number | null
  typical_materials: string | null
  notes: string | null
  notion_page_id: string | null
  created_at: string
  updated_at: string
}

export interface TradeContact {
  id: string
  name: string
  company: string | null
  trade: TradeType
  phone: string | null
  email: string | null
  notes: string | null
  notion_page_id: string | null
  created_at: string
  updated_at: string
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: Omit<Profile, 'created_at'>
        Update: Partial<Omit<Profile, 'id' | 'created_at'>>
      }
      customers: {
        Row: Customer
        Insert: Omit<Customer, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Customer, 'id' | 'created_at' | 'updated_at'>>
      }
      jobs: {
        Row: Job
        Insert: Omit<Job, 'id' | 'job_number' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Job, 'id' | 'job_number' | 'created_at' | 'updated_at'>>
      }
      job_photos: {
        Row: JobPhoto
        Insert: Omit<JobPhoto, 'id' | 'created_at'>
        Update: Partial<Omit<JobPhoto, 'id' | 'created_at'>>
      }
      invoices: {
        Row: Invoice
        Insert: Omit<Invoice, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Invoice, 'id' | 'created_at' | 'updated_at'>>
      }
      quote_requests: {
        Row: QuoteRequest
        Insert: Omit<QuoteRequest, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<QuoteRequest, 'id' | 'created_at' | 'updated_at'>>
      }
    }
  }
}
