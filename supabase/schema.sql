-- Aguirre Modern Tile - Job Board Schema
-- Run this in Supabase SQL Editor to set up the database

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Roles
CREATE TYPE user_role AS ENUM ('owner', 'lead');
CREATE TYPE job_status AS ENUM ('lead','quoted','scheduled','in_progress','completed','paid','cancelled');
CREATE TYPE invoice_status AS ENUM ('draft', 'sent', 'paid', 'overdue');

-- Profiles
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'lead',
  phone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_location_lat DOUBLE PRECISION,
  last_location_lng DOUBLE PRECISION,
  last_location_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, role) VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    'lead'
  );
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Jobs
CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_number SERIAL,
  title TEXT NOT NULL,
  status job_status NOT NULL DEFAULT 'lead',

  -- Client info
  client_name TEXT NOT NULL,
  client_phone TEXT,
  client_email TEXT,
  client_address TEXT,

  -- Job details
  job_type TEXT,
  square_footage NUMERIC(10,2),
  scope_notes TEXT,

  -- Schedule
  scheduled_start DATE,
  scheduled_end DATE,
  estimated_days INTEGER,
  actual_days INTEGER,

  -- Financial
  estimated_cost NUMERIC(10,2),
  actual_cost NUMERIC(10,2),
  amount_invoiced NUMERIC(10,2) DEFAULT 0,
  amount_paid NUMERIC(10,2) DEFAULT 0,

  -- Assignment
  assigned_to UUID REFERENCES profiles(id),

  -- Internal
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_jobs_job_number ON jobs(job_number);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_assigned ON jobs(assigned_to);
CREATE INDEX idx_jobs_schedule ON jobs(scheduled_start);

-- Auto-update timestamp
CREATE OR REPLACE FUNCTION update_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER jobs_updated_at
  BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Job Photos
CREATE TABLE job_photos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  photo_type TEXT DEFAULT 'reference',
  caption TEXT,
  uploaded_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_job_photos_job ON job_photos(job_id);

-- Invoices
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL UNIQUE,
  amount NUMERIC(10,2) NOT NULL,
  status invoice_status NOT NULL DEFAULT 'draft',
  due_date DATE NOT NULL,
  stripe_invoice_id TEXT,
  line_items JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invoices_job ON invoices(job_id);
CREATE INDEX idx_invoices_status ON invoices(status);

CREATE TRIGGER invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- Helper functions
CREATE OR REPLACE FUNCTION is_owner() RETURNS BOOLEAN AS $$
BEGIN RETURN EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner'); END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_team_member() RETURNS BOOLEAN AS $$
BEGIN RETURN EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_active = true); END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Profiles: team can read
CREATE POLICY "Team read profiles" ON profiles FOR SELECT TO authenticated USING (is_team_member());

-- Jobs: team reads, owner creates/edits/deletes
CREATE POLICY "Team read jobs" ON jobs FOR SELECT TO authenticated USING (is_team_member());
CREATE POLICY "Owner create jobs" ON jobs FOR INSERT TO authenticated WITH CHECK (is_owner());
CREATE POLICY "Owner update jobs" ON jobs FOR UPDATE TO authenticated USING (is_owner());
CREATE POLICY "Owner delete jobs" ON jobs FOR DELETE TO authenticated USING (is_owner());

-- Photos: team reads, owner uploads/deletes
CREATE POLICY "Team read photos" ON job_photos FOR SELECT TO authenticated USING (is_team_member());
CREATE POLICY "Owner upload photos" ON job_photos FOR INSERT TO authenticated WITH CHECK (is_owner());
CREATE POLICY "Owner delete photos" ON job_photos FOR DELETE TO authenticated USING (is_owner());

-- Invoices: team reads, owner creates/edits/deletes
CREATE POLICY "Team read invoices" ON invoices FOR SELECT TO authenticated USING (is_team_member());
CREATE POLICY "Owner create invoices" ON invoices FOR INSERT TO authenticated WITH CHECK (is_owner());
CREATE POLICY "Owner update invoices" ON invoices FOR UPDATE TO authenticated USING (is_owner());
CREATE POLICY "Owner delete invoices" ON invoices FOR DELETE TO authenticated USING (is_owner());

-- Storage policies (create bucket 'job-photos' as private first)
CREATE POLICY "Team view job photos" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'job-photos' AND (SELECT is_team_member()));
CREATE POLICY "Owner upload job photos" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'job-photos' AND (SELECT is_owner()));
CREATE POLICY "Owner delete job photos" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'job-photos' AND (SELECT is_owner()));
