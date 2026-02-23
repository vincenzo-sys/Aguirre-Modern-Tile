import { Metadata } from 'next'
import ProjectQuoteForm from '@/components/ProjectQuoteForm'

export const metadata: Metadata = {
  title: 'Backsplash Tile Quote | Aguirre Modern Tile',
  description: 'Get a free quote for your kitchen or bathroom backsplash tile project.',
}

const questions = [
  {
    id: 'location',
    label: 'Where is the backsplash?',
    type: 'radio' as const,
    options: [
      { value: 'kitchen', label: 'Kitchen' },
      { value: 'bathroom', label: 'Bathroom' },
      { value: 'both', label: 'Both kitchen and bathroom' },
      { value: 'other', label: 'Other area' },
    ],
  },
  {
    id: 'coverage',
    label: 'How much coverage?',
    type: 'radio' as const,
    options: [
      { value: 'stove-only', label: 'Behind stove/range only' },
      { value: 'counter', label: 'Full counter length' },
      { value: 'full-wall', label: 'Counter to ceiling' },
      { value: 'unsure', label: 'Not sure yet' },
    ],
  },
  {
    id: 'linearFeet',
    label: 'Approximate length (linear feet)',
    type: 'select' as const,
    options: [
      { value: 'small', label: 'Under 10 feet' },
      { value: 'medium', label: '10-20 feet' },
      { value: 'large', label: '20-30 feet' },
      { value: 'xlarge', label: 'Over 30 feet' },
      { value: 'unsure', label: 'Not sure' },
    ],
  },
  {
    id: 'existingBacksplash',
    label: 'Is there existing backsplash tile?',
    type: 'radio' as const,
    options: [
      { value: 'none', label: 'No, just drywall/paint' },
      { value: 'tile', label: 'Yes, tile to remove' },
      { value: 'other', label: 'Other material (stone, laminate, etc.)' },
    ],
  },
  {
    id: 'tileStyle',
    label: 'Tile style preference (optional)',
    type: 'select' as const,
    options: [
      { value: 'unsure', label: 'No preference / not sure' },
      { value: 'subway', label: 'Subway tile' },
      { value: 'mosaic', label: 'Mosaic / small tiles' },
      { value: 'large', label: 'Large format' },
      { value: 'pattern', label: 'Patterned / decorative' },
    ],
  },
]

export default function BacksplashQuotePage() {
  return (
    <section className="section-padding bg-gray-50 min-h-screen">
      <div className="container-custom">
        <div className="max-w-xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Backsplash Tile Project</h1>
            <p className="text-gray-600">Tell us about your backsplash and we'll send you a free estimate</p>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-8">
            <ProjectQuoteForm
              projectType="backsplash"
              projectTitle="Backsplash Tile"
              questions={questions}
            />
          </div>
        </div>
      </div>
    </section>
  )
}
