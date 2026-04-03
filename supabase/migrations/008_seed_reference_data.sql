-- Migration 008: Seed reference tables with real data from Notion
-- Run this in Supabase SQL Editor AFTER 007_reference_tables.sql

-- ============================================================
-- Materials Pricing (25 items from Notion)
-- ============================================================
INSERT INTO materials_pricing (item, category, your_cost, markup_percent, price_to_customer, coverage, unit) VALUES
-- Thinset
('Thinset - 254 Platinum (50 lb)', 'Thinset', 49.00, 0.20, 59.00, 45, 'sq ft/bag'),
('Thinset - 253 Gold (50 lb)', 'Thinset', 23.00, 0.20, 28.00, 65, 'sq ft/bag'),
-- Grout
('Grout 25 lb (bag)', 'Grout', 25.00, 0.20, 30.00, 100, 'sq ft/bag'),
('Caulking', 'Grout', 14.00, 0.20, 17.00, 1, 'per tube'),
-- Backer Board
('Cement Board 1/2" (3x5)', 'Backer Board', 12.00, 0.20, 14.00, 15, 'sq ft/sheet'),
('GoBoard 1/2" (3x5)', 'Backer Board', 25.00, 0.20, 30.00, 15, 'sq ft/sheet'),
('GoBoard 1/4" (3x5)', 'Backer Board', 20.00, 0.20, 24.00, 15, 'sq ft/sheet'),
-- Shower Pan/Tray
('Schluter Kerdi Shower Tray 38x38 Center', 'Shower Pan/Tray', 118.00, 0.20, 142.00, 1, 'per piece'),
('Schluter Kerdi Shower Tray 38x60 Off Center', 'Shower Pan/Tray', 142.00, 0.20, 170.00, 1, 'per piece'),
('Schluter Kerdi Shower Tray 48x48 Center', 'Shower Pan/Tray', 130.00, 0.20, 156.00, 1, 'per piece'),
('Schluter Kerdi Shower Tray 48x72 Center', 'Shower Pan/Tray', 226.00, 0.20, 271.00, 1, 'per piece'),
('Schluter Kerdi Shower Tray 72x72 Center', 'Shower Pan/Tray', 308.00, 0.20, 370.00, 1, 'per piece'),
('Schluter Kerdi-Drain 4x4 ABS Stainless', 'Shower Pan/Tray', 149.00, 0.20, 179.00, 1, 'per piece'),
('Schluter Kerdi-Board Curb 48x6', 'Shower Pan/Tray', 70.00, 0.20, 84.00, 1, 'per piece'),
-- Heating
('Schluter Ditra-Heat Peel & Stick 8.4 sqft', 'Heating', 35.00, 0.20, 42.00, 8, 'sq ft'),
('Schluter Ditra-Heat WiFi Thermostat', 'Heating', 378.00, 0.20, 454.00, 1, 'per piece'),
('Schluter Ditra-Heat Smart Thermostat', 'Heating', 387.00, 0.20, 464.00, 1, 'per piece'),
-- Accessories
('Carrara Marble White Corner Shelf', 'Accessories', 35.00, 0.20, 42.00, 1, 'per piece'),
('Bright White Polished Corner Shelf', 'Accessories', 24.00, 0.50, 36.00, 1, 'per piece'),
('Glass Corner Shelf', 'Accessories', 18.00, 0.50, 27.00, 1, 'per piece'),
('Metal Edge - Small', 'Accessories', 15.00, 0.20, 18.00, 1, 'per piece'),
('Schluter Kerdi-Board Triangular Bench 16x16', 'Accessories', 178.00, 0.20, 214.00, 1, 'per piece'),
('Schluter Kerdi-Board Bench 11.5x38', 'Accessories', 287.00, 0.20, 344.00, 1, 'per piece'),
-- Other
('Laticrete NXT Level Plus Self Leveling', 'Other', 49.00, 0.20, 59.00, 50, 'sq ft/bag'),
('Miracle 511 Impregnator Sealer', 'Other', 19.00, 0.20, 23.00, 1, 'per piece');

-- ============================================================
-- Labor Rates (6 settings from Notion)
-- ============================================================
INSERT INTO labor_rates (setting, value, notes) VALUES
('Standard Crew Size', 2, 'Number of tilers per job'),
('Day Rate (per tiler)', 250, 'Base daily rate per person'),
('Install Labor per Day (to customer)', 950, '$250 x 2 guys x 1.9'),
('Demo Labor per Day (to customer)', 800, '$250 x 2 guys x 1.6'),
('Demo Multiplier', 1.6, 'Markup for demo labor - $800/day for 2 guys'),
('Install Multiplier', 1.9, 'Markup for install labor - $950/day for 2 guys');

-- ============================================================
-- Operating Costs (5 settings from Notion)
-- ============================================================
INSERT INTO operating_costs (setting, value, notes) VALUES
('Trash Disposal - Small Job', '$150', 'Single area, less debris'),
('Trash Disposal - Large Job', '$300', 'Multiple areas, full demo'),
('Minimum Transportation Charge', '$25', 'Minimum fee for close jobs'),
('Headquarters', 'Revere, MA 02151', 'Base location for mileage calculations'),
('Rate per Mile (round trip)', '$0.70', 'IRS 2025 business rate');

-- ============================================================
-- Add-Ons (3 items from Notion)
-- ============================================================
INSERT INTO add_ons (item, price_to_customer, notes) VALUES
('Bench Install', 300.00, 'Flat rate per bench'),
('Niche Install', 250.00, 'Flat rate per niche'),
('Stone Pieces (window trim, niche sill)', 100.00, 'Per piece - usually need 4 for window + niche');

-- ============================================================
-- Job Templates (10 templates from Notion)
-- ============================================================
INSERT INTO job_templates (template_name, job_type, base_price_low, base_price_high, typical_sqft_low, typical_sqft_high, demo_days, install_days, typical_materials, notes) VALUES
('Backsplash (Standard)', 'Backsplash', 1200, 1800, 20, 35, 0, 1, 'Thinset 253 Gold (1 bag), grout (1 bag), caulking', 'Usually no demo needed - tile over drywall. Customer supplies tile. Simple subway pattern.'),
('Backsplash (Large/Complex)', 'Backsplash', 1800, 2500, 35, 60, 0.25, 1.5, 'Thinset 253 Gold (1 bag), grout (1 bag), caulking', 'Wrap-around or complex pattern (herringbone, etc). May include demo of existing backsplash.'),
('Walk-in Shower (Small)', 'Bathroom', 4000, 4800, 100, 130, 0.75, 2.5, 'GoBoard (8-10 sheets), thinset 253 Gold (2 bags), grout (1 bag), caulking, GoBoard sealant, 1 niche', 'Up to 4x4 shower. Add $250 per extra niche, $300 for bench. Glass door arranged by customer.'),
('Walk-in Shower (Large)', 'Bathroom', 5500, 6500, 150, 200, 1, 3, 'GoBoard (12-14 sheets), thinset 253 Gold (3 bags), grout (1 bag), caulking, GoBoard sealant, 1-2 niches', 'Larger than 4x4. Often includes bench. May need stone trim for windows.'),
('Standard Tub Surround', 'Bathroom', 3200, 3800, 70, 90, 0.5, 2, 'GoBoard (6 sheets), thinset 253 Gold (2 bags), grout (1 bag), caulking, GoBoard sealant', 'Customer usually supplies tile. Add $250 per niche. Includes demo of existing tile.'),
('Tub Surround + Bathroom Floor', 'Bathroom', 4800, 5800, 100, 130, 1, 3, 'GoBoard (6 sheets), cement board (3-4 sheets), thinset 253 Gold (3 bags), grout (1 bag), caulking, GoBoard sealant', 'Combined job - slight discount vs separate. Grout cure time between shower and floor.'),
('Shower Floor Only', 'Bathroom', 1400, 1800, 12, 25, 0.5, 1, 'Thinset 253 Gold (1 bag), grout (1 bag), caulking', 'HIGH RISK - demoing shower floor can compromise pan/waterproofing. May need full pan rebuild. Discuss with customer.'),
('Bathroom Floor (Small)', 'Floor', 1500, 2000, 25, 40, 0.5, 1, 'Cement board (3 sheets), thinset 253 Gold (1 bag), grout (1 bag), caulking', 'Toilet removal included - customer arranges plumber for reinstall. Watch for subfloor issues.'),
('Bathroom Floor (Medium)', 'Floor', 2200, 2800, 50, 80, 0.5, 1.5, 'Cement board (5-6 sheets), thinset 253 Gold (2 bags), grout (1 bag), caulking', 'May need Strata Mat for certain subfloors - adds cost. Toilet + vanity removal typical.'),
('Fireplace Surround', 'Floor', 1500, 2200, 20, 40, 0.25, 1, 'Cement board (2-3 sheets), thinset 253 Gold (1 bag), grout (1 bag)', 'Often uses stone or large format tile. Check for heat requirements on materials.');

-- ============================================================
-- Trade Contacts (1 contact from Notion)
-- ============================================================
INSERT INTO trade_contacts (name, company, trade, phone, notes) VALUES
('Avery', 'All Things Plumbing Co', 'Plumber', '781-654-5021', 'Recommend for toilet/vanity reinstall after tile work');
