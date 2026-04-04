'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, Save, Package, Wrench, Truck, Sparkles, FileText, Users } from 'lucide-react'
import { toast } from '@/components/Toast'

const isDemoMode = !process.env.NEXT_PUBLIC_SUPABASE_URL

type TabKey = 'materials' | 'labor' | 'costs' | 'addons' | 'templates' | 'contacts'

const tabs: { key: TabKey; label: string; icon: React.ElementType; table: string }[] = [
  { key: 'materials', label: 'Materials', icon: Package, table: 'materials_pricing' },
  { key: 'labor', label: 'Labor Rates', icon: Wrench, table: 'labor_rates' },
  { key: 'costs', label: 'Operating Costs', icon: Truck, table: 'operating_costs' },
  { key: 'addons', label: 'Add-Ons', icon: Sparkles, table: 'add_ons' },
  { key: 'templates', label: 'Job Templates', icon: FileText, table: 'job_templates' },
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
    { id: '3', setting: 'Install Labor per Day (to customer)', value: 950, notes: '$250 x 2 guys x 1.9' },
    { id: '4', setting: 'Demo Labor per Day (to customer)', value: 800, notes: '$250 x 2 guys x 1.6' },
    { id: '5', setting: 'Demo Multiplier', value: 1.6, notes: 'Markup for demo labor' },
    { id: '6', setting: 'Install Multiplier', value: 1.9, notes: 'Markup for install labor' },
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
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Manage pricing, rates, templates, and contacts</p>
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
          {activeTab === 'templates' && <TemplatesTable data={data} />}
          {activeTab === 'contacts' && <ContactsTable data={data} />}
        </div>
      )}
    </div>
  )
}

function MaterialsTable({ data }: { data: any[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-3">Item</th>
            <th className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-3">Category</th>
            <th className="text-right text-xs font-semibold text-gray-500 uppercase px-4 py-3">Your Cost</th>
            <th className="text-right text-xs font-semibold text-gray-500 uppercase px-4 py-3">Markup</th>
            <th className="text-right text-xs font-semibold text-gray-500 uppercase px-4 py-3">Customer Price</th>
            <th className="text-right text-xs font-semibold text-gray-500 uppercase px-4 py-3">Coverage</th>
            <th className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-3">Unit</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {data.map((row) => (
            <tr key={row.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 text-sm font-medium text-gray-900">{row.item}</td>
              <td className="px-4 py-3">
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{row.category}</span>
              </td>
              <td className="px-4 py-3 text-sm text-right text-gray-700">{formatCurrency(row.your_cost)}</td>
              <td className="px-4 py-3 text-sm text-right text-gray-500">{Math.round(row.markup_percent * 100)}%</td>
              <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">{formatCurrency(row.price_to_customer)}</td>
              <td className="px-4 py-3 text-sm text-right text-gray-500">{row.coverage}</td>
              <td className="px-4 py-3 text-xs text-gray-500">{row.unit}</td>
            </tr>
          ))}
        </tbody>
      </table>
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

function TemplatesTable({ data }: { data: any[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-3">Template</th>
            <th className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-3">Type</th>
            <th className="text-right text-xs font-semibold text-gray-500 uppercase px-4 py-3">Price Range</th>
            <th className="text-right text-xs font-semibold text-gray-500 uppercase px-4 py-3">Sq Ft</th>
            <th className="text-right text-xs font-semibold text-gray-500 uppercase px-4 py-3">Days</th>
            <th className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-3">Notes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {data.map((row) => (
            <tr key={row.id} className="hover:bg-gray-50">
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
              <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate">{row.notes ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
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
