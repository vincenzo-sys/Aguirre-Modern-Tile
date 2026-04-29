'use client'

import { useState, useEffect } from 'react'
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

// Format a phone number string as the user types: (xxx) xxx-xxxx.
// We strip non-digits, cap at 10, and progressively format. Keeping this
// inline (no helper) so the input stays a controlled component.
function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 10)
  if (digits.length === 0) return ''
  if (digits.length < 4) return `(${digits}`
  if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

export default function LeadCaptureForm() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [selectedProject, setSelectedProject] = useState('')
  const [contactInfo, setContactInfo] = useState({
    name: '',
    email: '',
    phone: '',
  })
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Restore any partial state on mount — if the user bailed mid-flow last
  // session we want them to pick up where they left off rather than start
  // over. Project type is the bigger commitment ask so restoring that is
  // what matters most.
  useEffect(() => {
    const storedProject = localStorage.getItem('leadProject')
    if (storedProject) setSelectedProject(storedProject)
    const storedContact = localStorage.getItem('leadContact')
    if (storedContact) {
      try {
        setContactInfo(JSON.parse(storedContact))
      } catch {
        // ignore corrupted localStorage
      }
    }
  }, [])

  const handleProjectSelect = (projectId: string) => {
    setSelectedProject(projectId)
    localStorage.setItem('leadProject', projectId)
    setStep(2)
  }

  const handleContactChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    const next = name === 'phone' ? formatPhone(value) : value
    setContactInfo(prev => ({ ...prev, [name]: next }))
    if (fieldErrors[name]) {
      setFieldErrors(prev => { const copy = { ...prev }; delete copy[name]; return copy })
    }
  }

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const errors = validateContact(contactInfo)
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }
    if (!selectedProject) {
      setStep(1)
      return
    }
    localStorage.setItem('leadContact', JSON.stringify(contactInfo))
    setIsSubmitting(true)
    router.push(`/quote/${selectedProject}`)
  }

  const isContactValid = contactInfo.name && contactInfo.email && contactInfo.phone

  return (
    <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8">
      {/* Progress Indicator */}
      <div className="flex items-center justify-center mb-6">
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

      {/* Step 1: Project Type — asked FIRST so the user feels they're getting
          somewhere before they hand over phone/email. Reduces dropoff vs.
          asking contact info first. */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="text-center mb-4">
            <h3 className="text-xl font-bold text-gray-900">Get Your Free Estimate</h3>
            <p className="text-gray-500 mt-1">What kind of project?</p>
          </div>

          <div className="space-y-3">
            {projectTypes.map((project) => {
              const Icon = project.icon
              const active = selectedProject === project.id
              return (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => handleProjectSelect(project.id)}
                  className={`w-full flex items-center gap-4 p-4 border-2 rounded-xl transition-all text-left active:scale-[0.99] ${
                    active
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-200 hover:border-primary-500 hover:bg-primary-50'
                  }`}
                >
                  <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center text-primary-600 flex-shrink-0">
                    <Icon className="w-6 h-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-900">{project.label}</p>
                    <p className="text-sm text-gray-500">{project.description}</p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
                </button>
              )
            })}
          </div>

          <p className="text-center text-gray-500 text-xs pt-2">
            Free estimates. We answer in 5 minutes.
          </p>
        </div>
      )}

      {/* Step 2: Contact Info — asked AFTER project selection so the user has
          already invested a tap and feels closer to the outcome. */}
      {step === 2 && (
        <form onSubmit={handleContactSubmit} className="space-y-4">
          <button
            type="button"
            onClick={() => setStep(1)}
            className="flex items-center gap-2 text-gray-500 hover:text-gray-700 text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          <div className="text-center mb-2">
            <h3 className="text-xl font-bold text-gray-900">Where should we send your estimate?</h3>
            <p className="text-gray-500 mt-1 text-sm">We&apos;ll reach out within 5 minutes.</p>
          </div>

          <div>
            <label htmlFor="lead-name" className="block text-sm font-medium text-gray-700 mb-2">
              Your Name
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
              <input
                id="lead-name"
                type="text"
                name="name"
                required
                autoComplete="name"
                value={contactInfo.name}
                onChange={handleContactChange}
                className={`w-full pl-11 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${fieldErrors.name ? 'border-red-400' : 'border-gray-300'}`}
                placeholder="John Smith"
              />
            </div>
            {fieldErrors.name && <p className="mt-1 text-sm text-red-600">{fieldErrors.name}</p>}
          </div>

          <div>
            <label htmlFor="lead-phone" className="block text-sm font-medium text-gray-700 mb-2">
              Phone Number
            </label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
              <input
                id="lead-phone"
                type="tel"
                name="phone"
                required
                inputMode="tel"
                autoComplete="tel"
                value={contactInfo.phone}
                onChange={handleContactChange}
                className={`w-full pl-11 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${fieldErrors.phone ? 'border-red-400' : 'border-gray-300'}`}
                placeholder="(617) 555-1234"
              />
            </div>
            {fieldErrors.phone && <p className="mt-1 text-sm text-red-600">{fieldErrors.phone}</p>}
          </div>

          <div>
            <label htmlFor="lead-email" className="block text-sm font-medium text-gray-700 mb-2">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
              <input
                id="lead-email"
                type="email"
                name="email"
                required
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
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
            disabled={!isContactValid || isSubmitting}
            className="w-full btn-cta disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            Continue
            <ArrowRight className="w-5 h-5" />
          </button>

          <p className="text-center text-gray-500 text-sm">
            We&apos;ll never share your info. Response within 5 minutes.
          </p>
        </form>
      )}
    </div>
  )
}
