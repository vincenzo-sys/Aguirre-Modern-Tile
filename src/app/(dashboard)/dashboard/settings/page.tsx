'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, Save, Package, Wrench, Truck, Sparkles, FileText, Users, ScrollText, X } from 'lucide-react'
import { toast } from '@/components/Toast'

const isDemoMode = !process.env.NEXT_PUBLIC_SUPABASE_URL

type TabKey = 'materials' | 'labor' | 'costs' | 'addons' | 'templates' | 'contacts' | 'defaults'

// Ordered by how often the tables get edited — most-edited first.
const tabs: { key: TabKey; label: string; icon: React.ElementType; table: string }[] = [
  { key: 'materials', label: 'Materials', icon: Package, table: 'materials_pricing' },
  { key: 'templates', label: 'Templates', icon: FileText, table: 'job_templates' },
  { key: 'defaults', label: 'Estimate Defaults', icon: ScrollText, table: 'estimate_defaults' },
  { key: 'labor', label: 'Labor Rates', icon: Wrench, table: 'labor_rates' },
  { key: 'addons', label: 'Add-Ons', icon: Sparkles, table: 'add_ons' },
  { key: 'costs', label: 'Operating Costs', icon: Truck, table: 'operating_costs' },
  { key: 'contacts', label: 'Trade Contacts', icon: Users, table: 'trade_contacts' },
]

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n)
}

// Demo data matching the seed SQL
const demoData: Record<string, any[]> = {
  materials_pricing: [
    { id: '1', item: 'Thinset - 254 Platinum (50 lb)', category: 'Thinset', your_cost: 49, markup_percent: 0.20, price_to_customer: 59, coverage: 45, unit: 'sq ft/bag' },
    { id: '2', item: 'Thinset - 253 Gold (50 lb)', category: 'Thinset', your_cost: 23, markup_percent: 0.20, price_to_customer: 28, coverage: 65, unit: 'sq ft/bag' },
    { id: '3', item: 'Grout 25 lb (bag)', category: 'Grout', your_cost: 25, markup_percent: 0.20, price_to_customer: 30, coverage: 100, unit: 'sq ft/bag' },
    { id: '4', item: 'Caulking', category: 'Grout', your_cost: 14, markup_percent: 0.20, price_to_customer: 17, coverage: 1, unit: 'per tube' },
    { id: '5', item: 'Cement Board 1/2" (3x5)', category: 'Backer Board', your_cost: 12, markup_percent: 0.20, price_to_customer: 14, coverage: 15, unit: 'sq ft/sheet' },
    { id: '6', item: 'GoBoard 1/2" (3x5)', category: 'Backer Board', your_cost: 25, markup_percent: 0.20, price_to_customer: 30, coverage: 15, unit: 'sq ft/sheet' },
    { id: '7', item: 'GoBoard 1/4" (3x5)', category: 'Backer Board', your_cost: 20, markup_percent: 0.20, price_to_customer: 24, coverage: 15, unit: 'sq ft/sheet' },
    { id: '8', item: 'Schluter Kerdi Shower Tray 38x60', category: 'Shower Pan/Tray', your_cost: 142, markup_percent: 0.20, price_to_customer: 170, coverage: 1, unit: 'per piece' },
    { id: '9', item: 'Schluter Kerdi-Drain 4x4 ABS', category: 'Shower Pan/Tray', your_cost: 149, markup_percent: 0.20, price_to_customer: 179, coverage: 1, unit: 'per piece' },
    { id: '10', item: 'Schluter Ditra-Heat Peel & Stick', category: 'Heating', your_cost: 35, markup_percent: 0.20, price_to_customer: 42, coverage: 8, unit: 'sq ft' },
    { id: '11', item: 'Ditra-Heat Smart Thermostat', category: 'Heating', your_cost: 387, markup_percent: 0.20, price_to_customer: 464, coverage: 1, unit: 'per piece' },
    { id: '12', item: 'Carrara Marble Corner Shelf', category: 'Accessories', your_cost: 35, markup_percent: 0.20, price_to_customer: 42, coverage: 1, unit: 'per piece' },
    { id: '13', item: 'Kerdi-Board Bench 11.5x38', category: 'Accessories', your_cost: 287, markup_percent: 0.20, price_to_customer: 344, coverage: 1, unit: 'per piece' },
    { id: '14', item: 'Miracle 511 Impregnator Sealer', category: 'Other', your_cost: 19, markup_percent: 0.20, price_to_customer: 23, coverage: 1, unit: 'per piece' },
    { id: '15', item: 'Laticrete NXT Level Plus', category: 'Other', your_cost: 49, markup_percent: 0.20, price_to_customer: 59, coverage: 50, unit: 'sq ft/bag' },
  ],
  labor_rates: [
    { id: '1', setting: 'Standard Crew Size', value: 2, notes: 'Number of tilers per job' },
    { id: '2', setting: 'Day Rate (per tiler)', value: 250, notes: 'Base daily rate per person' },
    { id: '3', setting: 'Install Labor per Day (to customer)', value: 1000, notes: '$250 x 2 guys x 2.0 (100% markup) = $1000/day' },
    { id: '4', setting: 'Demo Labor per Day (to customer)', value: 1000, notes: '$250 x 2 guys x 2.0 (100% markup) = $1000/day' },
    { id: '5', setting: 'Demo Multiplier', value: 2.0, notes: 'Markup for demo labor — $1000/day for 2 guys (100%)' },
    { id: '6', setting: 'Install Multiplier', value: 2.0, notes: 'Markup for install labor — $1000/day for 2 guys (100%)' },
  ],
  operating_costs: [
    { id: '1', setting: 'Trash Disposal - Small Job', value: '$150', notes: 'Single area, less debris' },
    { id: '2', setting: 'Trash Disposal - Large Job', value: '$300', notes: 'Multiple areas, full demo' },
    { id: '3', setting: 'Minimum Transportation Charge', value: '$25', notes: 'Minimum fee for close jobs' },
    { id: '4', setting: 'Headquarters', value: 'Revere, MA 02151', notes: 'Base location for mileage' },
    { id: '5', setting: 'Rate per Mile (round trip)', value: '$0.70', notes: 'IRS 2025 business rate' },
  ],
  add_ons: [
    { id: '1', item: 'Bench Install', price_to_customer: 300, notes: 'Flat rate per bench' },
    { id: '2', item: 'Niche Install', price_to_customer: 250, notes: 'Flat rate per niche' },
    { id: '3', item: 'Stone Pieces (window trim, niche sill)', price_to_customer: 100, notes: 'Per piece - usually need 4' },
  ],
  job_templates: [
    { id: '1', template_name: 'Backsplash (Standard)', job_type: 'Backsplash', base_price_low: 1200, base_price_high: 1800, typical_sqft_low: 20, typical_sqft_high: 35, demo_days: 0, install_days: 1, notes: 'No demo. Customer supplies tile.' },
    { id: '2', template_name: 'Backsplash (Large/Complex)', job_type: 'Backsplash', base_price_low: 1800, base_price_high: 2500, typical_sqft_low: 35, typical_sqft_high: 60, demo_days: 0.25, install_days: 1.5, notes: 'Herringbone, wrap-around patterns.' },
    { id: '3', template_name: 'Walk-in Shower (Small)', job_type: 'Bathroom', base_price_low: 4000, base_price_high: 4800, typical_sqft_low: 100, typical_sqft_high: 130, demo_days: 0.75, install_days: 2.5, notes: 'Up to 4x4. +$250/niche, +$300/bench.' },
    { id: '4', template_name: 'Walk-in Shower (Large)', job_type: 'Bathroom', base_price_low: 5500, base_price_high: 6500, typical_sqft_low: 150, typical_sqft_high: 200, demo_days: 1, install_days: 3, notes: 'Larger than 4x4. Often includes bench.' },
    { id: '5', template_name: 'Standard Tub Surround', job_type: 'Bathroom', base_price_low: 3200, base_price_high: 3800, typical_sqft_low: 70, typical_sqft_high: 90, demo_days: 0.5, install_days: 2, notes: '+$250 per niche. Includes demo.' },
    { id: '6', template_name: 'Tub Surround + Bath Floor', job_type: 'Bathroom', base_price_low: 4800, base_price_high: 5800, typical_sqft_low: 100, typical_sqft_high: 130, demo_days: 1, install_days: 3, notes: 'Combined — slight discount.' },
    { id: '7', template_name: 'Shower Floor Only', job_type: 'Bathroom', base_price_low: 1400, base_price_high: 1800, typical_sqft_low: 12, typical_sqft_high: 25, demo_days: 0.5, install_days: 1, notes: 'HIGH RISK — may need pan rebuild.' },
    { id: '8', template_name: 'Bathroom Floor (Small)', job_type: 'Floor', base_price_low: 1500, base_price_high: 2000, typical_sqft_low: 25, typical_sqft_high: 40, demo_days: 0.5, install_days: 1, notes: 'Toilet removal included.' },
    { id: '9', template_name: 'Bathroom Floor (Medium)', job_type: 'Floor', base_price_low: 2200, base_price_high: 2800, typical_sqft_low: 50, typical_sqft_high: 80, demo_days: 0.5, install_days: 1.5, notes: 'May need Strata Mat.' },
    { id: '10', template_name: 'Fireplace Surround', job_type: 'Floor', base_price_low: 1500, base_price_high: 2200, typical_sqft_low: 20, typical_sqft_high: 40, demo_days: 0.25, install_days: 1, notes: 'Check heat requirements.' },
  ],
  trade_contacts: [
    { id: '1', name: 'Avery', company: 'All Things Plumbing Co', trade: 'Plumber', phone: '781-654-5021', notes: 'Recommend for toilet/vanity reinstall' },
  ],
  estimate_defaults: [
    {
      id: 1,
      warranty_years: 3,
      warranty_text: 'Aguirre Modern Tile warrants all installation labor for 3 years from the date of project completion. If anything we installed cracks, comes loose, or fails due to our workmanship, we will return and fix it at no charge. This warranty covers labor only — tile, grout, and other materials carry their respective manufacturer warranties.',
      payment_terms_text: '10% deposit reserves your install date. Deposit is fully refundable until 48 hours before the scheduled start of the project. Final payment is due upon project completion and customer walkthrough sign-off.',
      payment_methods: ['Check', 'Credit Card', 'Debit Card', 'Bank Transfer', 'Zelle'],
      deposit_percent: 10,
      deposit_refund_window_hours: 48,
      customer_provides_default: 'Tile, grout color preference, any decorative or specialty features',
    },
  ],
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('materials')
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const activeTabConfig = tabs.find((t) => t.key === activeTab)!

  const loadData = useCallback(async () => {
    setLoading(true)
    if (isDemoMode) {
      setData(demoData[activeTabConfig.table] ?? [])
      setLoading(false)
      return
    }
    try {
      const res = await fetch(`/api/reference?table=${activeTabConfig.table}`)
      if (!res.ok) throw new Error('Failed to load')
      setData(await res.json())
    } catch {
      toast('Failed to load data', 'error')
    } finally {
      setLoading(false)
    }
  }, [activeTabConfig.table])

  useEffect(() => { loadData() }, [loadData])

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Estimating Guidance</h1>
        <p className="text-sm text-gray-500 mt-1">Materials pricing, labor rates, job templates, and trade contacts</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                activeTab === tab.key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {activeTab === 'materials' && <MaterialsTable data={data} />}
          {activeTab === 'labor' && <KeyValueTable data={data} valueLabel="Rate" valueFormat="currency" />}
          {activeTab === 'costs' && <KeyValueTable data={data} valueLabel="Value" valueFormat="text" />}
          {activeTab === 'addons' && <AddOnsTable data={data} />}
          {activeTab === 'templates' && <TemplatesTable data={data} onChanged={loadData} />}
          {activeTab === 'contacts' && <ContactsTable data={data} />}
          {activeTab === 'defaults' && <EstimateDefaultsEditor data={data} />}
        </div>
      )}
    </div>
  )
}

function MaterialsTable({ data }: { data: any[] }) {
  // Editable in place: change Your Cost, Customer Price, or Markup %.
  // Changing cost recomputes price at current markup. Changing markup recomputes
  // price at current cost. Changing price recomputes markup at current cost.
  // Blur to save. Markup is enforced at a 20% floor — anything lower is bumped.
  const [rows, setRows] = useState(data)
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => setRows(data), [data])

  function markup(r: any): number {
    if (!r.your_cost || r.your_cost <= 0) return 0
    return (r.price_to_customer - r.your_cost) / r.your_cost
  }

  async function patch(id: string, updates: Record<string, unknown>) {
    setSaving(id)
    try {
      const res = await fetch(`/api/reference/materials_pricing/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (!res.ok) throw new Error('save failed')
      toast('Saved', 'success')
    } catch {
      toast('Save failed', 'error')
    } finally {
      setSaving(null)
    }
  }

  function updateField(id: string, field: 'your_cost' | 'price_to_customer' | 'markup', value: number) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r
        const next = { ...r }
        if (field === 'your_cost') {
          next.your_cost = value
          // Keep current markup, recompute price (floored at 20%)
          const mk = Math.max(markup(r), 0.20)
          next.price_to_customer = Number((value * (1 + mk)).toFixed(2))
          next.markup_percent = mk
        } else if (field === 'markup') {
          const mk = Math.max(value, 0.20)
          next.markup_percent = mk
          next.price_to_customer = Number((r.your_cost * (1 + mk)).toFixed(2))
        } else {
          // Price edit — enforce 20% minimum above cost
          const min = r.your_cost * 1.20
          next.price_to_customer = Math.max(value, min)
          next.markup_percent = r.your_cost > 0 ? (next.price_to_customer - r.your_cost) / r.your_cost : 0
        }
        patch(id, {
          your_cost: next.your_cost,
          price_to_customer: next.price_to_customer,
          markup_percent: next.markup_percent,
        })
        return next
      })
    )
  }

  return (
    <div className="overflow-x-auto">
      <div className="px-4 py-2 bg-blue-50 text-xs text-blue-900 border-b border-blue-200">
        Edit Your Cost, Markup %, or Customer Price — the other fields auto-recalculate. Markup floor is 20% on cost.
      </div>
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-3">Item</th>
            <th className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-3">Category</th>
            <th className="text-right text-xs font-semibold text-gray-500 uppercase px-4 py-3">Your Cost</th>
            <th className="text-right text-xs font-semibold text-gray-500 uppercase px-4 py-3">Markup %</th>
            <th className="text-right text-xs font-semibold text-gray-500 uppercase px-4 py-3">Customer Price</th>
            <th className="text-right text-xs font-semibold text-gray-500 uppercase px-4 py-3">Coverage</th>
            <th className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-3">Unit</th>
            <th className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-3">Sources</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row) => {
            const mk = markup(row)
            const underFloor = mk < 0.1999
            return (
              <tr key={row.id} className={`hover:bg-gray-50 ${saving === row.id ? 'opacity-60' : ''}`}>
                <td className="px-4 py-3 text-sm font-medium text-gray-900">{row.item}</td>
                <td className="px-4 py-3">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{row.category}</span>
                </td>
                <td className="px-4 py-3 text-sm text-right">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={row.your_cost}
                    onBlur={(e) => {
                      const v = Number(e.target.value)
                      if (v !== row.your_cost) updateField(row.id, 'your_cost', v)
                    }}
                    className="w-24 text-right px-2 py-1 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                </td>
                <td className="px-4 py-3 text-sm text-right">
                  <input
                    type="number"
                    step="0.1"
                    min="20"
                    defaultValue={(mk * 100).toFixed(1)}
                    onBlur={(e) => {
                      const v = Number(e.target.value) / 100
                      if (Math.abs(v - mk) > 0.001) updateField(row.id, 'markup', v)
                    }}
                    className={`w-20 text-right px-2 py-1 border rounded focus:outline-none focus:ring-1 focus:ring-primary-500 ${underFloor ? 'border-red-300 text-red-700' : 'border-gray-200'}`}
                  />
                </td>
                <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={row.price_to_customer}
                    onChange={(e) => {
                      const v = Number(e.target.value)
                      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, price_to_customer: v } : r)))
                    }}
                    onBlur={(e) => {
                      const v = Number(e.target.value)
                      if (Math.abs(v - row.price_to_customer) > 0.001 || v !== data.find(d => d.id === row.id)?.price_to_customer) {
                        updateField(row.id, 'price_to_customer', v)
                      }
                    }}
                    className="w-24 text-right px-2 py-1 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                </td>
                <td className="px-4 py-3 text-sm text-right text-gray-500">{row.coverage}</td>
                <td className="px-4 py-3 text-xs text-gray-500">{row.unit}</td>
                <td className="px-4 py-3"><SourceLinks links={row.source_links} fallback={row.retail_link} /></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// Per-retailer source links (migration 037). Renders small chips that open the
// product page in a new tab so the team can re-check a retailer's live price.
// Falls back to the legacy single retail_link when source_links is empty.
function SourceLinks({
  links,
  fallback,
}: {
  links?: { floor_decor?: string; lowes?: string; home_depot?: string } | null
  fallback?: string | null
}) {
  const entries: Array<[string, string]> = []
  if (links?.floor_decor) entries.push(['F&D', links.floor_decor])
  if (links?.lowes) entries.push(["Lowe's", links.lowes])
  if (links?.home_depot) entries.push(['HD', links.home_depot])
  if (entries.length === 0 && fallback) entries.push(['Link', fallback])
  if (entries.length === 0) return <span className="text-xs text-gray-300">—</span>
  return (
    <div className="flex flex-wrap gap-1">
      {entries.map(([label, url]) => (
        <a
          key={label}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] px-2 py-0.5 rounded-full bg-primary-50 text-primary-700 border border-primary-200 hover:bg-primary-100 whitespace-nowrap"
        >
          {label}
        </a>
      ))}
    </div>
  )
}

function KeyValueTable({ data, valueLabel, valueFormat }: { data: any[]; valueLabel: string; valueFormat: 'currency' | 'text' }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-3">Setting</th>
            <th className="text-right text-xs font-semibold text-gray-500 uppercase px-4 py-3">{valueLabel}</th>
            <th className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-3">Notes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {data.map((row) => (
            <tr key={row.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 text-sm font-medium text-gray-900">{row.setting}</td>
              <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">
                {valueFormat === 'currency' ? formatCurrency(row.value) : row.value}
              </td>
              <td className="px-4 py-3 text-sm text-gray-500">{row.notes ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AddOnsTable({ data }: { data: any[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-3">Add-On</th>
            <th className="text-right text-xs font-semibold text-gray-500 uppercase px-4 py-3">Price</th>
            <th className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-3">Notes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {data.map((row) => (
            <tr key={row.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 text-sm font-medium text-gray-900">{row.item}</td>
              <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">{formatCurrency(row.price_to_customer)}</td>
              <td className="px-4 py-3 text-sm text-gray-500">{row.notes ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TemplatesTable({ data, onChanged }: { data: any[]; onChanged?: () => void }) {
  // Click a row to open the per-template editor for customer_provides_default.
  // Other template fields stay read-only here — they're seeded via migrations
  // and edited rarely; opening that surface is a future-pass thing.
  const [editing, setEditing] = useState<any | null>(null)
  return (
    <>
      <div className="overflow-x-auto">
        <div className="px-4 py-2 bg-blue-50 text-xs text-blue-900 border-b border-blue-200">
          Click a template to edit the &ldquo;customer provides&rdquo; text that pre-fills new estimates for that scope.
        </div>
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-3">Template</th>
              <th className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-3">Type</th>
              <th className="text-right text-xs font-semibold text-gray-500 uppercase px-4 py-3">Price Range</th>
              <th className="text-right text-xs font-semibold text-gray-500 uppercase px-4 py-3">Sq Ft</th>
              <th className="text-right text-xs font-semibold text-gray-500 uppercase px-4 py-3">Days</th>
              <th className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-3">Customer Provides</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.map((row) => (
              <tr key={row.id} onClick={() => setEditing(row)} className="hover:bg-gray-50 cursor-pointer">
                <td className="px-4 py-3 text-sm font-medium text-gray-900">{row.template_name}</td>
                <td className="px-4 py-3">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{row.job_type}</span>
                </td>
                <td className="px-4 py-3 text-sm text-right text-gray-700">
                  {row.base_price_low && row.base_price_high ? `${formatCurrency(row.base_price_low)} - ${formatCurrency(row.base_price_high)}` : '—'}
                </td>
                <td className="px-4 py-3 text-sm text-right text-gray-500">
                  {row.typical_sqft_low && row.typical_sqft_high ? `${row.typical_sqft_low}-${row.typical_sqft_high}` : '—'}
                </td>
                <td className="px-4 py-3 text-sm text-right text-gray-500">
                  {(row.demo_days ?? 0) + (row.install_days ?? 0)}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500 max-w-md truncate">
                  {row.customer_provides_default ?? <span className="italic text-gray-400">— click to set —</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <TemplateProvidesModal
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            onChanged?.()
          }}
        />
      )}
    </>
  )
}

function TemplateProvidesModal({
  row,
  onClose,
  onSaved,
}: {
  row: any
  onClose: () => void
  onSaved: () => void
}) {
  const [text, setText] = useState<string>(row.customer_provides_default ?? '')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      const res = await fetch(`/api/reference/job_templates/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_provides_default: text }),
      })
      if (!res.ok) throw new Error('save failed')
      toast('Saved', 'success')
      onSaved()
    } catch {
      toast('Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-xl w-full p-6">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-lg font-bold text-gray-900">{row.template_name}</h3>
            <p className="text-xs text-gray-500 mt-0.5">Customer provides — pre-fills new estimates for this template.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          placeholder="e.g. Tile, plumbing fixtures, transition strips…"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function EstimateDefaultsEditor({ data }: { data: any[] }) {
  // Singleton row (id=1). The editor is one form: warranty + payment + deposit
  // + the global customer-provides fallback. Per-template customer-provides
  // text lives on the Templates tab.
  const row = data[0]
  const [form, setForm] = useState<any>(row ?? null)
  const [saving, setSaving] = useState(false)
  const [methodInput, setMethodInput] = useState('')

  useEffect(() => setForm(row ?? null), [row])

  if (!form) {
    return (
      <div className="p-8 text-center text-gray-500 text-sm">
        No defaults row yet — run migration 029, then refresh.
      </div>
    )
  }

  function update<K extends string>(key: K, value: unknown) {
    setForm((prev: any) => ({ ...prev, [key]: value }))
  }

  function addMethod() {
    const v = methodInput.trim()
    if (!v) return
    if ((form.payment_methods as string[]).includes(v)) {
      setMethodInput('')
      return
    }
    update('payment_methods', [...form.payment_methods, v])
    setMethodInput('')
  }

  function removeMethod(idx: number) {
    update('payment_methods', form.payment_methods.filter((_: string, i: number) => i !== idx))
  }

  async function save() {
    setSaving(true)
    try {
      const payload = {
        warranty_years: Number(form.warranty_years),
        warranty_text: form.warranty_text,
        payment_terms_text: form.payment_terms_text,
        payment_methods: form.payment_methods,
        deposit_percent: Number(form.deposit_percent),
        deposit_refund_window_hours: Number(form.deposit_refund_window_hours),
        customer_provides_default: form.customer_provides_default,
      }
      const res = await fetch(`/api/reference/estimate_defaults/1`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('save failed')
      toast('Estimate defaults saved', 'success')
    } catch {
      toast('Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900">
        These defaults are <strong>snapshotted onto each job</strong> when its estimate is generated. Editing here changes future estimates only — already-issued estimates keep their copy and stay editable per-job.
      </div>

      {/* Warranty */}
      <Section title="Warranty" subtitle="Shown in the warranty card on every estimate.">
        <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-3 items-start">
          <div>
            <Label>Years</Label>
            <input
              type="number"
              min={1}
              max={10}
              value={form.warranty_years}
              onChange={(e) => update('warranty_years', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
          <div>
            <Label>Warranty text</Label>
            <textarea
              value={form.warranty_text}
              onChange={(e) => update('warranty_text', e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
        </div>
      </Section>

      {/* Payment terms */}
      <Section title="Payment terms" subtitle="Schedule sentence + accepted payment methods.">
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <Label>Deposit %</Label>
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={form.deposit_percent}
              onChange={(e) => update('deposit_percent', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
          <div>
            <Label>Refund window (hours before start)</Label>
            <input
              type="number"
              min={0}
              step={1}
              value={form.deposit_refund_window_hours}
              onChange={(e) => update('deposit_refund_window_hours', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
        </div>
        <Label>Payment terms text</Label>
        <textarea
          value={form.payment_terms_text}
          onChange={(e) => update('payment_terms_text', e.target.value)}
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
        />

        <div className="mt-4">
          <Label>Accepted payment methods</Label>
          <div className="flex flex-wrap gap-2 mb-2">
            {(form.payment_methods as string[]).map((m, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 rounded-full text-sm text-gray-700">
                {m}
                <button onClick={() => removeMethod(i)} aria-label={`Remove ${m}`} className="text-gray-400 hover:text-red-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={methodInput}
              onChange={(e) => setMethodInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addMethod()
                }
              }}
              placeholder="Add a method (e.g. Venmo)"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
            <button
              type="button"
              onClick={addMethod}
              className="px-3 py-2 text-sm font-medium text-primary-700 border border-primary-600 rounded-lg hover:bg-primary-50 inline-flex items-center gap-1"
            >
              <Plus className="w-4 h-4" /> Add
            </button>
          </div>
        </div>
      </Section>

      {/* Customer provides global fallback */}
      <Section title="Customer provides — global fallback" subtitle="Used when neither the template nor the job has its own customer-provides text.">
        <textarea
          value={form.customer_provides_default}
          onChange={(e) => update('customer_provides_default', e.target.value)}
          rows={2}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
      </Section>

      <div className="flex justify-end pt-2 border-t border-gray-100">
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving…' : 'Save defaults'}
        </button>
      </div>
    </div>
  )
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/50">
      <h3 className="font-semibold text-gray-900 text-sm">{title}</h3>
      {subtitle && <p className="text-xs text-gray-500 mt-0.5 mb-3">{subtitle}</p>}
      {children}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-medium text-gray-600 mb-1">{children}</label>
}

function ContactsTable({ data }: { data: any[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-3">Name</th>
            <th className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-3">Company</th>
            <th className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-3">Trade</th>
            <th className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-3">Phone</th>
            <th className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-3">Notes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {data.map((row) => (
            <tr key={row.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 text-sm font-medium text-gray-900">{row.name}</td>
              <td className="px-4 py-3 text-sm text-gray-700">{row.company ?? '—'}</td>
              <td className="px-4 py-3">
                <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">{row.trade}</span>
              </td>
              <td className="px-4 py-3 text-sm text-gray-600">{row.phone ?? '—'}</td>
              <td className="px-4 py-3 text-sm text-gray-500">{row.notes ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
