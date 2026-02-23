import { Metadata } from 'next'
import ProjectQuoteForm from '@/components/ProjectQuoteForm'

export const metadata: Metadata = {
  title: 'Bathroom Tile Quote | Aguirre Modern Tile',
  description: 'Get a free quote for your bathroom tile project. Full remodels, floors, walls, and more.',
}

const questions = [
  {
    id: 'projectScope',
    label: 'What are you looking to do?',
    type: 'radio' as const,
    options: [
      { value: 'full-remodel', label: 'Full bathroom remodel (floors + walls)' },
      { value: 'floor-only', label: 'Floor tile only' },
      { value: 'walls-only', label: 'Wall tile only' },
      { value: 'floor-and-walls', label: 'Floor and some walls (not full remodel)' },
    ],
  },
  {
    id: 'showerIncluded',
    label: 'Does this include the shower?',
    type: 'radio' as const,
    options: [
      { value: 'yes', label: 'Yes, include shower tile' },
      { value: 'no', label: 'No shower / separate project' },
      { value: 'shower-only', label: 'Actually, just the shower' },
    ],
  },
  {
    id: 'size',
    label: 'Approximate bathroom size',
    type: 'select' as const,
    options: [
      { value: 'small', label: 'Small (under 50 sq ft)' },
      { value: 'medium', label: 'Medium (50-80 sq ft)' },
      { value: 'large', label: 'Large (80-120 sq ft)' },
      { value: 'master', label: 'Master bath (120+ sq ft)' },
      { value: 'unsure', label: 'Not sure' },
    ],
  },
  {
    id: 'existingTile',
    label: 'Is there existing tile to remove?',
    type: 'radio' as const,
    options: [
      { value: 'yes', label: 'Yes, remove existing tile' },
      { value: 'no', label: 'No, it\'s new construction / down to subfloor' },
      { value: 'unsure', label: 'Not sure' },
    ],
  },
  {
    id: 'extras',
    label: 'Any special features? (optional)',
    type: 'text' as const,
    placeholder: 'e.g., heated floors, shower niche, bench seat...',
  },
]

export default function BathroomQuotePage() {
  return (
    <section className="section-padding bg-gray-50 min-h-screen">
      <div className="container-custom">
        <div className="max-w-xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Bathroom Tile Project</h1>
            <p className="text-gray-600">Tell us about your bathroom and we'll send you a free estimate</p>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-8">
            <ProjectQuoteForm
              projectType="bathroom"
              projectTitle="Bathroom Tile"
              questions={questions}
            />
          </div>
        </div>
      </div>
    </section>
  )
}
