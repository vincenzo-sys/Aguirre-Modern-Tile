import { Metadata } from 'next'
import ProjectQuoteForm from '@/components/ProjectQuoteForm'

export const metadata: Metadata = {
  title: 'Kitchen Floor Tile Quote | Aguirre Modern Tile',
  description: 'Get a free quote for your kitchen floor tile project. All sizes and styles.',
}

const questions = [
  {
    id: 'existingFloor',
    label: 'What\'s the current floor?',
    type: 'radio' as const,
    options: [
      { value: 'tile', label: 'Existing tile (needs removal)' },
      { value: 'vinyl', label: 'Vinyl / linoleum' },
      { value: 'hardwood', label: 'Hardwood' },
      { value: 'concrete', label: 'Concrete / subfloor' },
      { value: 'other', label: 'Other' },
    ],
  },
  {
    id: 'openFloorplan',
    label: 'Does the kitchen connect to other rooms?',
    type: 'radio' as const,
    options: [
      { value: 'kitchen-only', label: 'Kitchen only (enclosed)' },
      { value: 'dining', label: 'Open to dining room' },
      { value: 'living', label: 'Open to living room' },
      { value: 'both', label: 'Open to dining and living' },
    ],
  },
  {
    id: 'includeConnected',
    label: 'Tile the connected rooms too?',
    type: 'radio' as const,
    options: [
      { value: 'kitchen-only', label: 'Just the kitchen' },
      { value: 'all', label: 'Yes, tile all connected areas' },
      { value: 'undecided', label: 'Not sure yet' },
    ],
  },
  {
    id: 'size',
    label: 'Approximate square footage',
    type: 'select' as const,
    options: [
      { value: 'small', label: 'Under 100 sq ft' },
      { value: 'medium', label: '100-200 sq ft' },
      { value: 'large', label: '200-400 sq ft' },
      { value: 'xlarge', label: 'Over 400 sq ft' },
      { value: 'unsure', label: 'Not sure' },
    ],
  },
  {
    id: 'tileSize',
    label: 'Tile size preference (optional)',
    type: 'select' as const,
    options: [
      { value: 'unsure', label: 'No preference / not sure' },
      { value: 'standard', label: 'Standard (12x12 or 12x24)' },
      { value: 'large', label: 'Large format (24x24 or bigger)' },
      { value: 'pattern', label: 'Pattern / mosaic' },
    ],
  },
]

export default function KitchenFloorQuotePage() {
  return (
    <section className="section-padding bg-gray-50 min-h-screen">
      <div className="container-custom">
        <div className="max-w-xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Kitchen Floor Tile Project</h1>
            <p className="text-gray-600">Tell us about your kitchen floor and we'll send you a free estimate</p>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-8">
            <ProjectQuoteForm
              projectType="kitchen-floor"
              projectTitle="Kitchen Floor Tile"
              questions={questions}
            />
          </div>
        </div>
      </div>
    </section>
  )
}
