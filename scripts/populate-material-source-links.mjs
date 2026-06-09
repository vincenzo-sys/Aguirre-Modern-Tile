// Populate materials_pricing.source_links from the 2026-06 retailer review.
// Idempotently adds the column (migration 037) then sets per-retailer links.
// Only same-product links are stored (approximate cross-brand matches skipped).
//
//   node scripts/populate-material-source-links.mjs
//
// Runs in a transaction; prints each row's stored links.

import fs from 'node:fs/promises'
import path from 'node:path'
import pg from 'pg'

const text = await fs.readFile(path.resolve('.env.local'), 'utf8')
for (const line of text.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

const F = 'floor_decor', L = 'lowes', H = 'home_depot'
// id -> { retailer: url }
const LINKS = {
  // Accessories
  '08b9ffef-7c03-4061-8577-6b3c71c010c9': { [F]: 'https://www.flooranddecor.com/shower-accessories/bright-white-polished-corner-shelf-100610518.html' },
  'd7d94212-181c-46f0-b4b9-c264de3c7a86': { [F]: 'https://www.flooranddecor.com/carrara-marble-white-corner-shelf-101011351.html' },
  'eed1fc14-8a14-475d-a9aa-7966fd4d6164': { [F]: 'https://www.flooranddecor.com/shower-accessories/glass-corner-shelf-100932425.html', [L]: 'https://www.lowes.com/pd/Anatolia-Tile-Hudson-Tempered-Corner-Shelf-9-in-x-9-in-Natural-Glass-Wall-Tile/1001042776' },
  'ecf1c32a-3f69-47f4-9c09-db061575e3b4': { [F]: 'https://www.flooranddecor.com/schluter-installation-materials/schluter-kerdi-board-sb-rectangular-bench-11-1-2in.-x-38in.-100565787.html', [L]: 'https://www.lowes.com/pd/Schluter-Systems-Kerdi-Orange-Shower-Wall-Straight-Shower-Bench/1001052104', [H]: 'https://www.homedepot.com/p/Schluter-Kerdi-Board-SB-38-in-x-11-1-2-in-Rectangular-Shower-Bench-KBSB290970RA/309830436' },
  '8e7bf948-8d56-43e1-a25f-5cdaeba9b85d': { [F]: 'https://www.flooranddecor.com/shower-systems-installation-materials/schluter-kerdi-board-sb-triangular-bench-16in.-x-16in.-100597855.html', [L]: 'https://www.lowes.com/pd/Schluter-Systems-Kerdi-Board-SB-Orange-Shower-Wall-Corner-Shower-Bench/1000119893', [H]: 'https://www.homedepot.com/p/Schluter-Kerdi-Board-SB-16-in-x-16-in-Triangular-Shower-Bench-Floor-Installation-Kit-for-Accessories-KBSB410TA/309830434' },
  // Backer Board
  '56af6ee0-43f1-44df-968c-746374095b3b': { [F]: 'https://www.flooranddecor.com/tile-floor-preparation-installation-materials/durock-cement-board-with-edgeguard-100517507.html', [L]: 'https://www.lowes.com/pd/DUROCK-Brand-0-5-in-x-36-in-x-60-in-Cement-Backer-Board/1000383889', [H]: 'https://www.homedepot.com/p/USG-Durock-Brand-1-2-in-x-3-ft-x-5-ft-Cement-Board-with-EdgeGuard-172954/304163165' },
  '9d624a50-d7f9-45c6-a87c-9b3ef12af133': { [L]: 'https://www.lowes.com/pd/Johns-Manville-0-47-in-x-36-in-x-60-in-GOBOARD-Polyisocyanurate-Backer-Board/999931180' },
  'daa942eb-170a-4b3c-9582-7161db115616': { [L]: 'https://www.lowes.com/pd/Johns-Manville-0-26-in-x-36-in-x-60-in-GOBOARD-Polyisocyanurate-Backer-Board/999930274' },
  '776622a8-76ae-4a4d-851b-dce957f2dd10': { [L]: 'https://www.lowes.com/pd/Johns-Manville-GoBoard-Wood-Fastener-1-625in-and-Washer-1-25in-Kit/5016307929' },
  'bc5d25af-e7a6-4764-b3a5-0cdb1e3c7d33': { [L]: 'https://www.lowes.com/pd/Johns-Manville-GoBoard-10-3-fl-oz-White-Oil-Based-Drywall-Sealant/1002867020' },
  '2001d39f-5992-4311-b33e-0398e7ab0f6d': { [F]: 'https://www.flooranddecor.com/laticrete-installation-materials/laticrete-strata-mat-150sqft.-100898311.html' },
  // Grout
  '6287c42c-23d0-4c08-b31f-4ca65b4a35ed': { [F]: 'https://www.flooranddecor.com/tile-caulk-installation-materials/laticrete-latasil-silicone-sealant%C2%A0-LA103.html' },
  '9382ae93-5903-4baa-afb8-87e629d8f0ac': { [F]: 'https://www.flooranddecor.com/tile-grout-installation-materials/laticrete-03-silk-permacolor-grout-100895366.html', [L]: 'https://www.lowes.com/pd/LATICRETE-25-lbs-Natural-Grey-Sanded-Powder-Grout/3079043' },
  'dae58a00-bb45-40e4-909f-9a3357316491': { [F]: 'https://www.flooranddecor.com/tile-grout-installation-materials/laticrete-spectralock-pro-premium-grout-part-ab-100897412.html' },
  'e73416bc-4a72-4b82-bc02-1e96b259bb07': { [F]: 'https://www.flooranddecor.com/tile-grout-installation-materials/laticrete-60-dusty-gray-spectralock-part-c-100898014.html', [L]: 'https://www.lowes.com/pd/LATICRETE-SLOCK-Part-C-Powder-Dusty-Grey/3504588' },
  // Heating
  '2002c4fa-fb91-44de-8b45-9d3e09555481': { [F]: 'https://www.flooranddecor.com/floor-warming-systems-trending-installation-materials/schluter-32sqft.-ditra-heat-120v-heating-cable-100055367.html', [L]: 'https://www.lowes.com/pd/Schluter-Systems-120-Volt-Radiant-Ditra-Heat-E-HK-Warming-Wire-32-sq-ft/5015137845', [H]: 'https://www.homedepot.com/p/Schluter-Ditra-Heat-120-Volt-105-8-ft-Heating-Cable-DHEHK12032/205485280' },
  '491b0f4c-fbe0-4601-8f27-137145a3be7b': { [F]: 'https://www.flooranddecor.com/floor-warming-systems-trending-installation-materials/schluter-ditra-heat-membrane-sheets-100055409.html', [L]: 'https://www.lowes.com/pd/Schluter-Systems-31-in-x-39-in-Orange-Underfloor-Heating-Mat/50201649', [H]: 'https://www.homedepot.com/p/Schluter-Ditra-Heat-3-ft-2-5-8-in-x-2-ft-7-3-8-in-Uncoupling-Membrane-Sheet-DH5MA/205485274' },
  '92c8f391-25e8-4353-807c-1cf711cabae5': { [L]: 'https://www.lowes.com/pd/Schluter-Systems-Radiant-Ditra-Heat-PS-Underfloor-Heating-Mat-8-4-sq-ft/5015137651', [H]: 'https://www.homedepot.com/p/Schluter-Ditra-Heat-PS-3-ft-2-5-8-in-x-2-ft-7-3-8-in-Peel-and-Stick-Uncoupling-Membrane-Sheet-DHPS5MA/326763741' },
  '879965eb-96ba-43d6-9a20-4dea2d204a5f': { [F]: 'https://www.flooranddecor.com/schluter-installation-materials/schluter-ditra-heat-e-rs1-smart-thermostat-101138196.html', [L]: 'https://www.lowes.com/pd/Schluter-Systems-Dual-voltage-Radiant-Ditra-Heat-E-RS1-Programmable-Thermostat/5015137649', [H]: 'https://www.homedepot.com/p/Schluter-Ditra-Heat-E-RS1-Smart-Thermostat-Bright-White-DHERT105-BW/324887556' },
  'ce9dad9a-d7c0-46e2-831d-ae92fe8705ca': { [L]: 'https://www.lowes.com/pd/Schluter-Systems-3-1875-in-x-5-125-in-Dual-Voltage-Digital-Programmable-Thermostat/1002938492', [H]: 'https://www.homedepot.com/p/Schluter-Ditra-Heat-Wi-Fi-Programmable-Thermostat-Bright-White-DHERT104-BW/310502612' },
  'a1565254-ac23-48a6-87ff-84c8b7675902': { [F]: 'https://www.flooranddecor.com/floor-warming-systems-trending-installation-materials/schluter-ditra-heat-e-r-non-programmable-thermostat-white-100216241.html', [H]: 'https://www.homedepot.com/p/Schluter-Ditra-Heat-Non-Programmable-Thermostat-Bright-White-DHERT103-BW/206891649' },
  // Other
  '44aa938a-3dd6-4ec0-befa-9594ad839ab6': { [F]: 'https://www.flooranddecor.com/laticrete-installation-materials/laticrete-nxt-level-plus-self-leveling-100895333.html' },
  '7f1a7ef5-21ed-4b74-b3b4-fdf74f3945ee': { [F]: 'https://www.flooranddecor.com/tile-sealers-installation-materials/miracle-511-impregnator-penetrating-sealer-100038298.html', [L]: 'https://www.lowes.com/pd/Miracle-Sealants-Company-511-Impregnator-16-fl-oz-Clear-Natural-Stone-Sealer-and-Finish-Pour-Bottle/1000356441', [H]: 'https://www.homedepot.com/p/Miracle-Sealants-16-oz-511-Impregnator-Penetrating-Sealer-511PT6R/100672948' },
  // Shower Pan/Tray
  '7bdbb782-eff0-468a-825e-6c594a084a52': { [F]: 'https://www.flooranddecor.com/shower-systems-installation-materials/schluter-kerdi-shower-center-tray-thin-38in.-x-38in.-100597798.html', [L]: 'https://www.lowes.com/pd/Schluter-Systems-Kerdi-Shower-T-TS-TT-Styrene-Shower-Base-38-in-W-x-38-in-L-with-Center-Drain/1002938484', [H]: 'https://www.homedepot.com/p/Schluter-Kerdi-Shower-T-TS-TT-38-in-x-38-in-Sloped-Shower-Tray-KST965BF/309468531' },
  '84138e9a-751d-428b-a83f-26a5b7701479': { [F]: 'https://www.flooranddecor.com/schluter-installation-materials/schluter-kerdi-shower-off-center-tray-38in.-x-60in.-100597780.html', [L]: 'https://www.lowes.com/pd/Schluter-Systems-Kerdi-Shower-Tray-38-in-X-60-in-Side/5001928097', [H]: 'https://www.homedepot.com/p/Schluter-Kerdi-Shower-38-in-x-60-in-Off-Center-Shower-Tray-KST965-1525S/308315437' },
  'd0c358ae-4b62-47bc-9dac-23e91387eabb': { [F]: 'https://www.flooranddecor.com/shower-systems-installation-materials/schluter-kerdi-shower-tray-48in.-x-48in.-cen-100597806.html', [L]: 'https://www.lowes.com/pd/Schluter-Systems-Kerdi-Shower-T-TS-TT-48-in-W-x-48-in-L-with-Center-Drain-Square-Shower-Base-Orange/5002456733', [H]: 'https://www.homedepot.com/p/Schluter-Kerdi-Shower-48-in-x-48-in-Shower-Tray-KST1220BF/308315438' },
  '1c80543d-651f-4270-adce-ad7096ed7f14': { [F]: 'https://www.flooranddecor.com/shower-systems-installation-materials/schluter-kerdi-shower-center-tray-48in.-x-72in.-100597814.html', [L]: 'https://www.lowes.com/pd/Schluter-Systems-Kerdi-Shower-T-TS-TT-Styrene-Shower-Base-72-in-W-x-48-in-L-with-Center-Drain/1001052192', [H]: 'https://www.homedepot.com/p/Schluter-Kerdi-Shower-T-TS-TT-48-in-x-72-in-Sloped-Shower-Tray-KST1220-1830/309468535' },
  '2d41ac80-6e64-4dc0-bf8c-0c0b3f784f9f': { [F]: 'https://www.flooranddecor.com/schluter-installation-materials/schluter-kerdi-shower-center-tray-72in.-x-72in.-101142727.html', [L]: 'https://www.lowes.com/pd/Schluter-Systems-Kerdi-Shower-T-TS-TT-Styrene-Shower-Base-72-in-W-x-72-in-L-with-Center-Drain/1000877726', [H]: 'https://www.homedepot.com/p/Schluter-Kerdi-Shower-T-TS-TT-72-in-x-72-in-Sloped-Shower-Tray-KST1830/309468544' },
  '63c492ec-cdf1-4fdd-97fd-92b29ab2ef86': { [F]: 'https://www.flooranddecor.com/schluter-installation-materials/schluter-3ft.-kerdi-waterproofing-membrane-215sqft.-951500248.html', [L]: 'https://www.lowes.com/pd/Schluter-Systems-Kerdi-215-sq-ft-Orange-Plastic-Waterproofing-Tile-Membrane/4328069', [H]: 'https://www.homedepot.com/p/Schluter-Kerdi-215-sq-ft-39-in-W-x-65-ft-L-x-8-mm-T-Waterproofing-Membrane-Underlayment-for-Tile-KERDI200-20M/202608387' },
  '4ce12fbf-ca48-46d0-b0a9-3b805e27988e': { [F]: 'https://www.flooranddecor.com/shower-systems-installation-materials/schluter-kerdi-band-5in.-x-33ft.-waterproofing-underlayment-strip-100154244.html', [L]: 'https://www.lowes.com/pd/Schluter-Systems-Kerdi-Band-Orange-Plastic-Waterproofing-Tile-Membrane/1000189225', [H]: 'https://www.homedepot.com/p/Kerdi-Band-5-in-x-32-ft-10-in-x-4-mil-Underlayment-Waterproofing-Strip-KEBA100-125-10M/202608379' },
  'e7275dcb-f516-4d89-a550-c160f3c7a9e7': { [F]: 'https://www.flooranddecor.com/schluter-kerdi-board-sc-curb-48in.-x-6in.-x-4-1-2in.-100597970.html', [L]: 'https://www.lowes.com/pd/Schluter-Systems-Kerdi-Orange-Styrene-Shower-Curb/1001052004', [H]: 'https://www.homedepot.com/p/Schluter-Kerdi-Board-SC-48-in-x-6-in-x-4-1-2-in-Shower-Curb-KBSC1151501220/308315436' },
  'b451b0c6-f921-40ae-bf95-ab66125e605f': { [L]: 'https://www.lowes.com/pd/Schluter-Systems-Kerdi-Drain-Stainless-Steel-Shower-Drain/5000109243', [H]: 'https://www.homedepot.com/p/Schluter-Kerdi-Drain-4-in-x-4-in-ABS-Drain-Kit-in-Stainless-Steel-KD2-ABS-E/202608352' },
  // Thinset
  '67a55c58-40fc-4ac4-bb4e-d6e358d0183a': { [F]: 'https://www.flooranddecor.com/tile-mortars-and-thinsets-installation-materials/mapei-4-to-1-mud-bed-mix-100154483.html', [L]: 'https://www.lowes.com/pd/MAPEI-4-to-1-Mud-Bed-Mix-55-lb-Powder-Indoor-or-Outdoor-Floor-Patch/5015187667' },
  '600724fc-bec2-42f7-aa27-6c8278486408': { [F]: 'https://www.flooranddecor.com/tile-mortars-and-thinsets-installation-materials/schluter-all-set-gray-modified-thin-set-mortar-100609817.html', [L]: 'https://www.lowes.com/pd/Schluter-Systems-All-Set-50-Pound-s-Gray-Powder-Thinset-mortar/5000281365' },
  '73ee19c3-f3f1-46fe-b54a-a5d669e615e1': { [F]: 'https://www.flooranddecor.com/tile-mortars-and-thinsets-installation-materials/laticrete-253-gold-white-100894716.html' },
  'b3f458ec-78f4-47ff-9800-50e61c81659a': { [F]: 'https://www.flooranddecor.com/laticrete-254-platinum-white-100898345.html' },
}

const c = new pg.Client({ connectionString: process.env.DATABASE_URI })
await c.connect()
try {
  await c.query(`ALTER TABLE materials_pricing ADD COLUMN IF NOT EXISTS source_links JSONB NOT NULL DEFAULT '{}'::jsonb`)
  await c.query('BEGIN')
  let n = 0
  for (const [id, links] of Object.entries(LINKS)) {
    const { rowCount } = await c.query(
      'UPDATE materials_pricing SET source_links = $1, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(links), id],
    )
    if (rowCount === 0) { console.log(`SKIP (not found): ${id}`); continue }
    n++
    console.log(`${id}: ${Object.keys(links).join(', ')}`)
  }
  await c.query('COMMIT')
  console.log(`\nStored source_links on ${n} materials.`)
} catch (err) {
  await c.query('ROLLBACK')
  console.error('ROLLED BACK:', err.message)
  process.exitCode = 1
} finally {
  await c.end()
}
