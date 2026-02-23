export type UserRole = 'owner' | 'lead'
export type JobStatus = 'lead' | 'quoted' | 'scheduled' | 'in_progress' | 'completed' | 'paid' | 'cancelled'
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue'

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

export interface Job {
  id: string
  job_number: number
  title: string
  status: JobStatus
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
  assigned_to: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface JobWithAssignee extends Job {
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
}

export interface Invoice {
  id: string
  job_id: string
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

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: Omit<Profile, 'created_at'>
        Update: Partial<Omit<Profile, 'id' | 'created_at'>>
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
    }
  }
}
