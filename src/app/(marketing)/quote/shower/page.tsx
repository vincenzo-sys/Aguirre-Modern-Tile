import { Metadata } from 'next'
import ProjectQuoteForm from '@/components/ProjectQuoteForm'

export const metadata: Metadata = {
  title: 'Shower Tile Quote | Aguirre Modern Tile',
  description: 'Get a free quote for your shower tile project. Custom showers, remodels, and waterproofing.',
}

const questions = [
  {
    id: 'projectType',
    label: 'What type of shower project?',
    type: 'radio' as const,
    options: [
      { value: 'remodel', label: 'Remodel existing shower' },
      { value: 'new', label: 'New shower (new construction or conversion)' },
      { value: 'retile', label: 'Just re-tile (waterproofing is fine)' },
    ],
  },
  {
    id: 'showerType',
    label: 'What type of shower?',
    type: 'radio' as const,
    options: [
      { value: 'standup', label: 'Stand-up shower' },
      { value: 'tub-shower', label: 'Tub/shower combo' },
      { value: 'walkin', label: 'Walk-in (curbless or low curb)' },
      { value: 'unsure', label: 'Not sure yet' },
    ],
  },
  {
    id: 'size',
    label: 'Approximate shower size',
    type: 'select' as const,
    options: [
      { value: 'small', label: 'Small (3x3 or smaller)' },
      { value: 'standard', label: 'Standard (3x4 or 3x5)' },
      { value: 'large', label: 'Large (4x5 or bigger)' },
      { value: 'custom', label: 'Custom size' },
      { value: 'unsure', label: 'Not sure' },
    ],
  },
  {
    id: 'features',
    label: 'Any special features?',
    type: 'radio' as const,
    options: [
      { value: 'basic', label: 'Basic - just tile' },
      { value: 'niche', label: 'Include a niche (shampoo shelf)' },
      { value: 'bench', label: 'Include a bench seat' },
      { value: 'both', label: 'Both niche and bench' },
    ],
  },
  {
    id: 'drainType',
    label: 'Drain preference (optional)',
    type: 'select' as const,
    options: [
      { value: 'center', label: 'Standard center drain' },
      { value: 'linear', label: 'Linear/trench drain' },
      { value: 'unsure', label: 'No preference / not sure' },
    ],
  },
]

export default function ShowerQuotePage() {
  return (
    <section className="section-padding bg-gray-50 min-h-screen">
      <div className="container-custom">
        <div className="max-w-xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Shower Tile Project</h1>
            <p className="text-gray-600">Tell us about your shower and we'll send you a free estimate</p>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-8">
            <ProjectQuoteForm
              projectType="shower"
              projectTitle="Shower Tile"
              questions={questions}
            />
          </div>
        </div>
      </div>
    </section>
  )
}
