import type { JobLineItem } from '@/lib/supabase/types'

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(amount)
}

export default function JobLineItems({ items }: { items: JobLineItem[] }) {
  const materials = items.filter((i) => i.category === 'materials')
  const labor = items.filter((i) => i.category === 'labor')

  const materialsTotal = materials.reduce((sum, i) => sum + i.amount, 0)
  const laborTotal = labor.reduce((sum, i) => sum + i.amount, 0)
  const grandTotal = materialsTotal + laborTotal

  if (items.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-gray-800">
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Line Items</h3>
        </div>
        <div className="p-6 text-center text-gray-400 text-sm">
          No line items yet. Add items to build the scope of work.
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 bg-gray-800">
        <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Line Items</h3>
      </div>

      {/* Materials */}
      {materials.length > 0 && (
        <div>
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Materials</span>
            <span className="text-xs font-medium text-gray-500">{formatCurrency(materialsTotal)}</span>
          </div>
          <div className="divide-y divide-gray-100">
            {materials.map((item, i) => (
              <div key={i} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">{item.description}</p>
                  <p className="text-xs text-gray-500">
                    {item.quantity} {item.unit} &times; {formatCurrency(item.unit_price)}/{item.unit}
                  </p>
                </div>
                <span className="text-sm font-medium text-gray-900">{formatCurrency(item.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Labor */}
      {labor.length > 0 && (
        <div>
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Labor</span>
            <span className="text-xs font-medium text-gray-500">{formatCurrency(laborTotal)}</span>
          </div>
          <div className="divide-y divide-gray-100">
            {labor.map((item, i) => (
              <div key={i} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">{item.description}</p>
                  <p className="text-xs text-gray-500">
                    {item.quantity} {item.unit} &times; {formatCurrency(item.unit_price)}/{item.unit}
                  </p>
                </div>
                <span className="text-sm font-medium text-gray-900">{formatCurrency(item.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Total */}
      <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between">
          {materials.length > 0 && labor.length > 0 && (
            <div className="text-xs text-gray-500">
              Materials: {formatCurrency(materialsTotal)} &middot; Labor: {formatCurrency(laborTotal)}
            </div>
          )}
          <div className="ml-auto text-right">
            <span className="text-xs text-gray-500 uppercase tracking-wider">Total</span>
            <p className="text-xl font-bold text-gray-900">{formatCurrency(grandTotal)}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
