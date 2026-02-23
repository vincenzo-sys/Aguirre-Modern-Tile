import { Check, X } from 'lucide-react'

const comparisons = [
  {
    feature: 'Response Time',
    us: '5 minutes',
    them: '1-3 days',
  },
  {
    feature: 'Virtual Estimates',
    us: true,
    usText: 'Same day from photos',
    them: false,
    themText: 'In-person only',
  },
  {
    feature: 'Waterproofing',
    us: true,
    usText: 'KERDI/GO-BOARD systems',
    them: false,
    themText: 'Basic or none',
  },
  {
    feature: 'Communication',
    us: true,
    usText: 'Updates throughout',
    them: false,
    themText: 'Radio silence',
  },
  {
    feature: 'Pricing',
    us: true,
    usText: 'Transparent, fair',
    them: false,
    themText: 'Hidden fees',
  },
  {
    feature: 'Google Reviews',
    us: '150+ five-star',
    them: 'Mixed',
  },
]

export default function ComparisonTable() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            <th className="text-left py-4 px-4 bg-gray-50 font-semibold text-gray-600">
              Feature
            </th>
            <th className="text-center py-4 px-4 bg-primary-50 font-semibold text-primary-700">
              Aguirre Modern Tile
            </th>
            <th className="text-center py-4 px-4 bg-gray-50 font-semibold text-gray-600">
              Typical Contractor
            </th>
          </tr>
        </thead>
        <tbody>
          {comparisons.map((row, index) => (
            <tr key={index} className="border-b border-gray-100">
              <td className="py-4 px-4 font-medium text-gray-900">
                {row.feature}
              </td>
              <td className="py-4 px-4 text-center bg-primary-50/50">
                {typeof row.us === 'boolean' ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
                      <Check className="w-4 h-4 text-green-600" />
                    </div>
                    <span className="text-green-700 font-medium">
                      {row.usText}
                    </span>
                  </div>
                ) : (
                  <span className="text-primary-700 font-medium">{row.us}</span>
                )}
              </td>
              <td className="py-4 px-4 text-center">
                {typeof row.them === 'boolean' ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-6 h-6 bg-red-100 rounded-full flex items-center justify-center">
                      <X className="w-4 h-4 text-red-600" />
                    </div>
                    <span className="text-gray-500">{row.themText}</span>
                  </div>
                ) : (
                  <span className="text-gray-500">{row.them}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
