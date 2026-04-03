-- Migration 007: Create reference tables for estimation engine
-- These mirror the Notion databases: Materials Pricing, Labor Rates,
-- Operating Costs, Add-Ons, Job Templates, Trade Contacts
-- Run this in Supabase SQL Editor

-- ============================================================
-- 1. Materials Pricing
-- ============================================================
CREATE TABLE materials_pricing (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Other',
  your_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  markup_percent NUMERIC(5,4) NOT NULL DEFAULT 0.20,
  price_to_customer NUMERIC(10,2) NOT NULL DEFAULT 0,
  coverage NUMERIC(10,2) DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'per piece',
  retail_link TEXT,
  notion_page_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_materials_category ON materials_pricing(category);
CREATE UNIQUE INDEX idx_materials_notion ON materials_pricing(notion_page_id) WHERE notion_page_id IS NOT NULL;

CREATE TRIGGER materials_pricing_updated_at
  BEFORE UPDATE ON materials_pricing
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE materials_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team read materials" ON materials_pricing FOR SELECT TO authenticated USING (is_team_member());
CREATE POLICY "Owner manage materials" ON materials_pricing FOR ALL TO authenticated USING (is_owner()) WITH CHECK (is_owner());

-- ============================================================
-- 2. Labor Rates
-- ============================================================
CREATE TABLE labor_rates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  setting TEXT NOT NULL,
  value NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes TEXT,
  notion_page_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_labor_rates_notion ON labor_rates(notion_page_id) WHERE notion_page_id IS NOT NULL;

CREATE TRIGGER labor_rates_updated_at
  BEFORE UPDATE ON labor_rates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE labor_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team read labor_rates" ON labor_rates FOR SELECT TO authenticated USING (is_team_member());
CREATE POLICY "Owner manage labor_rates" ON labor_rates FOR ALL TO authenticated USING (is_owner()) WITH CHECK (is_owner());

-- ============================================================
-- 3. Operating Costs
-- ============================================================
CREATE TABLE operating_costs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  setting TEXT NOT NULL,
  value TEXT NOT NULL,
  notes TEXT,
  notion_page_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_operating_costs_notion ON operating_costs(notion_page_id) WHERE notion_page_id IS NOT NULL;

CREATE TRIGGER operating_costs_updated_at
  BEFORE UPDATE ON operating_costs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE operating_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team read operating_costs" ON operating_costs FOR SELECT TO authenticated USING (is_team_member());
CREATE POLICY "Owner manage operating_costs" ON operating_costs FOR ALL TO authenticated USING (is_owner()) WITH CHECK (is_owner());

-- ============================================================
-- 4. Add-Ons
-- ============================================================
CREATE TABLE add_ons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item TEXT NOT NULL,
  price_to_customer NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes TEXT,
  notion_page_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_add_ons_notion ON add_ons(notion_page_id) WHERE notion_page_id IS NOT NULL;

CREATE TRIGGER add_ons_updated_at
  BEFORE UPDATE ON add_ons
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE add_ons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team read add_ons" ON add_ons FOR SELECT TO authenticated USING (is_team_member());
CREATE POLICY "Owner manage add_ons" ON add_ons FOR ALL TO authenticated USING (is_owner()) WITH CHECK (is_owner());

-- ============================================================
-- 5. Job Templates
-- ============================================================
CREATE TABLE job_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_name TEXT NOT NULL,
  job_type TEXT NOT NULL,
  base_price_low NUMERIC(10,2),
  base_price_high NUMERIC(10,2),
  typical_sqft_low NUMERIC(10,2),
  typical_sqft_high NUMERIC(10,2),
  demo_days NUMERIC(5,2),
  install_days NUMERIC(5,2),
  typical_materials TEXT,
  notes TEXT,
  notion_page_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_job_templates_type ON job_templates(job_type);
CREATE UNIQUE INDEX idx_job_templates_notion ON job_templates(notion_page_id) WHERE notion_page_id IS NOT NULL;

CREATE TRIGGER job_templates_updated_at
  BEFORE UPDATE ON job_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE job_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team read job_templates" ON job_templates FOR SELECT TO authenticated USING (is_team_member());
CREATE POLICY "Owner manage job_templates" ON job_templates FOR ALL TO authenticated USING (is_owner()) WITH CHECK (is_owner());

-- ============================================================
-- 6. Trade Contacts
-- ============================================================
CREATE TABLE trade_contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  company TEXT,
  trade TEXT NOT NULL DEFAULT 'Other',
  phone TEXT,
  email TEXT,
  notes TEXT,
  notion_page_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_trade_contacts_trade ON trade_contacts(trade);
CREATE UNIQUE INDEX idx_trade_contacts_notion ON trade_contacts(notion_page_id) WHERE notion_page_id IS NOT NULL;

CREATE TRIGGER trade_contacts_updated_at
  BEFORE UPDATE ON trade_contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE trade_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team read trade_contacts" ON trade_contacts FOR SELECT TO authenticated USING (is_team_member());
CREATE POLICY "Owner manage trade_contacts" ON trade_contacts FOR ALL TO authenticated USING (is_owner()) WITH CHECK (is_owner());
