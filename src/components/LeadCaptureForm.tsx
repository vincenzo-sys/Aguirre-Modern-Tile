'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, ArrowLeft, User, Phone, Mail, Home, Droplets, Grid3X3, Wrench, HelpCircle, Check } from 'lucide-react'
import { validateContact } from '@/lib/validation'

const projectTypes = [
  {
    id: 'bathroom',
    label: 'Bathroom',
    description: 'Full bathroom or floor remodel',
    icon: Home,
  },
  {
    id: 'shower',
    label: 'Shower',
    description: 'Shower tile installation or remodel',
    icon: Droplets,
  },
  {
    id: 'kitchen-floor',
    label: 'Kitchen Floor',
    description: 'Kitchen floor tile installation',
    icon: Grid3X3,
  },
  {
    id: 'backsplash',
    label: 'Backsplash',
    description: 'Kitchen or bathroom backsplash',
    icon: Wrench,
  },
  {
    id: 'other',
    label: 'Other',
    description: 'Other tile project',
    icon: HelpCircle,
  },
]

export default function LeadCaptureForm() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [contactInfo, setContactInfo] = useState({
    name: '',
    email: '',
    phone: '',
  })
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [selectedProject, setSelectedProject] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleContactChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setContactInfo(prev => ({ ...prev, [name]: value }))
    if (fieldErrors[name]) {
      setFieldErrors(prev => { const next = { ...prev }; delete next[name]; return next })
    }
  }

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const errors = validateContact(contactInfo)
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }
    localStorage.setItem('leadContact', JSON.stringify(contactInfo))
    setStep(2)
  }

  const handleProjectSelect = (projectId: string) => {
    setSelectedProject(projectId)
    setIsSubmitting(true)
    router.push(`/quote/${projectId}`)
  }

  const isContactValid = contactInfo.name && contactInfo.email && contactInfo.phone

  return (
    <div className="bg-white rounded-2xl shadow-xl p-8">
      {/* Progress Indicator */}
      <div className="flex items-center justify-center mb-8">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
            step >= 1 ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-500'
          }`}>
            {step > 1 ? <Check className="w-5 h-5" /> : '1'}
          </div>
          <div className={`w-16 h-1 rounded ${step >= 2 ? 'bg-primary-600' : 'bg-gray-200'}`} />
          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
            step >= 2 ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-500'
          }`}>
            2
          </div>
        </div>
      </div>

      {/* Step 1: Contact Info */}
      {step === 1 && (
        <form onSubmit={handleContactSubmit} className="space-y-5">
          <div className="text-center mb-6">
            <h3 className="text-xl font-bold text-gray-900">Get Your Free Estimate</h3>
            <p className="text-gray-500 mt-1">Tell us how to reach you</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Your Name
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                name="name"
                required
                value={contactInfo.name}
                onChange={handleContactChange}
                className={`w-full pl-11 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${fieldErrors.name ? 'border-red-400' : 'border-gray-300'}`}
                placeholder="John Smith"
              />
            </div>
            {fieldErrors.name && <p className="mt-1 text-sm text-red-600">{fieldErrors.name}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Phone Number
            </label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="tel"
                name="phone"
                required
                value={contactInfo.phone}
                onChange={handleContactChange}
                className={`w-full pl-11 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${fieldErrors.phone ? 'border-red-400' : 'border-gray-300'}`}
                placeholder="(617) 555-1234"
              />
            </div>
            {fieldErrors.phone && <p className="mt-1 text-sm text-red-600">{fieldErrors.phone}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="email"
                name="email"
                required
                value={contactInfo.email}
                onChange={handleContactChange}
                className={`w-full pl-11 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${fieldErrors.email ? 'border-red-400' : 'border-gray-300'}`}
                placeholder="john@example.com"
              />
            </div>
            {fieldErrors.email && <p className="mt-1 text-sm text-red-600">{fieldErrors.email}</p>}
          </div>

          <button
            type="submit"
            disabled={!isContactValid}
            className="w-full btn-cta disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            Continue
            <ArrowRight className="w-5 h-5" />
          </button>

          <p className="text-center text-gray-500 text-sm">
            We'll never share your info. Response within 5 minutes.
          </p>
        </form>
      )}

      {/* Step 2: Project Type */}
      {step === 2 && (
        <div className="space-y-5">
          <button
            onClick={() => setStep(1)}
            className="flex items-center gap-2 text-gray-500 hover:text-gray-700 text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          <div className="text-center mb-6">
            <h3 className="text-xl font-bold text-gray-900">What type of project?</h3>
            <p className="text-gray-500 mt-1">Select your project type</p>
          </div>

          <div className="space-y-3">
            {projectTypes.map((project) => {
              const Icon = project.icon
              return (
                <button
                  key={project.id}
                  onClick={() => handleProjectSelect(project.id)}
                  disabled={isSubmitting}
                  className="w-full flex items-center gap-4 p-4 border-2 border-gray-200 rounded-xl hover:border-primary-500 hover:bg-primary-50 transition-all text-left disabled:opacity-50"
                >
                  <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center text-primary-600">
                    <Icon className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{project.label}</p>
                    <p className="text-sm text-gray-500">{project.description}</p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-gray-400 ml-auto" />
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
