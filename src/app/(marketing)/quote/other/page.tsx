import { Metadata } from 'next'
import ProjectQuoteForm from '@/components/ProjectQuoteForm'

export const metadata: Metadata = {
  title: 'Tile Project Quote | Aguirre Modern Tile',
  description: 'Get a free quote for your tile project. We handle all types of tile work.',
}

const questions = [
  {
    id: 'projectDescription',
    label: 'Tell us about your project',
    type: 'textarea' as const,
    placeholder: 'Describe what you\'re looking to do - location, scope, any specific requirements...',
  },
  {
    id: 'projectType',
    label: 'What type of project is it?',
    type: 'select' as const,
    options: [
      { value: 'floor', label: 'Floor tile (not kitchen)' },
      { value: 'wall', label: 'Wall tile' },
      { value: 'outdoor', label: 'Outdoor / patio' },
      { value: 'fireplace', label: 'Fireplace surround' },
      { value: 'repair', label: 'Tile repair / replacement' },
      { value: 'other', label: 'Something else' },
    ],
  },
  {
    id: 'size',
    label: 'Approximate size',
    type: 'text' as const,
    placeholder: 'e.g., 10x12 room, 50 sq ft, etc.',
  },
  {
    id: 'timeline',
    label: 'When are you looking to start?',
    type: 'select' as const,
    options: [
      { value: 'asap', label: 'As soon as possible' },
      { value: '1-2weeks', label: 'Within 1-2 weeks' },
      { value: '1month', label: 'Within a month' },
      { value: 'flexible', label: 'Flexible / just getting quotes' },
    ],
  },
]

export default function OtherQuotePage() {
  return (
    <section className="section-padding bg-gray-50 min-h-screen">
      <div className="container-custom">
        <div className="max-w-xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Other Tile Project</h1>
            <p className="text-gray-600">Tell us about your project and we'll send you a free estimate</p>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-8">
            <ProjectQuoteForm
              projectType="other"
              projectTitle="Tile"
              questions={questions}
            />
          </div>
        </div>
      </div>
    </section>
  )
}
