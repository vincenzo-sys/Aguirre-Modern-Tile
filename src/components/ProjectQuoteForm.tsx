'use client'

import { useState, useEffect, useRef } from 'react'
import { Upload, X, Camera, Check, Loader2, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { toast } from '@/components/Toast'
import { validateContact } from '@/lib/validation'

interface Question {
  id: string
  label: string
  type: 'select' | 'radio' | 'text' | 'textarea'
  options?: { value: string; label: string }[]
  placeholder?: string
}

interface ProjectQuoteFormProps {
  projectType: string
  projectTitle: string
  questions: Question[]
}

export default function ProjectQuoteForm({ projectType, projectTitle, questions }: ProjectQuoteFormProps) {
  const [contactInfo, setContactInfo] = useState({ name: '', email: '', phone: '' })
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [files, setFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const stored = localStorage.getItem('leadContact')
    if (stored) {
      setContactInfo(JSON.parse(stored))
    }
  }, [])

  const handleAnswerChange = (questionId: string, value: string) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: value,
    }))
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || [])
    if (selectedFiles.length + files.length > 10) {
      toast('Maximum 10 photos allowed', 'warning')
      return
    }

    setFiles(prev => [...prev, ...selectedFiles])

    selectedFiles.forEach(file => {
      const reader = new FileReader()
      reader.onloadend = () => {
        setPreviews(prev => [...prev, reader.result as string])
      }
      reader.readAsDataURL(file)
    })
  }

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
    setPreviews(prev => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError('')

    const errors = validateContact(contactInfo)
    if (Object.keys(errors).length > 0) {
      toast('Please check your contact info on the previous step.', 'warning')
      return
    }

    setIsSubmitting(true)

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: contactInfo.name,
          email: contactInfo.email,
          phone: contactInfo.phone,
          projectType,
          answers,
          source: 'quote',
        }),
      })

      if (!res.ok) throw new Error('Failed to send')

      setIsSubmitting(false)
      setIsSubmitted(true)
      localStorage.removeItem('leadContact')
    } catch {
      setIsSubmitting(false)
      setSubmitError('Something went wrong. Please call us at (617) 766-1259.')
    }
  }

  if (isSubmitted) {
    return (
      <div className="bg-green-50 rounded-2xl p-8 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Check className="w-8 h-8 text-green-600" />
        </div>
        <h3 className="text-xl font-bold text-gray-900 mb-2">
          Request Received!
        </h3>
        <p className="text-gray-600 mb-4">
          Thanks {contactInfo.name}! We'll review your {projectTitle.toLowerCase()} project details and get back to you within a few hours with an estimate.
        </p>
        <p className="text-sm text-gray-500">
          We'll contact you at {contactInfo.phone} or {contactInfo.email}
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-700 text-sm mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Start over
      </Link>

      {/* Contact Summary */}
      <div className="bg-gray-50 rounded-xl p-4 mb-6">
        <p className="text-sm text-gray-500 mb-1">Sending estimate to:</p>
        <p className="font-semibold text-gray-900">{contactInfo.name}</p>
        <p className="text-sm text-gray-600">{contactInfo.email} &bull; {contactInfo.phone}</p>
      </div>

      {/* Project-Specific Questions */}
      {questions.map(question => (
        <div key={question.id}>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {question.label}
          </label>

          {question.type === 'select' && (
            <select
              value={answers[question.id] || ''}
              onChange={e => handleAnswerChange(question.id, e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="">Select an option...</option>
              {question.options?.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          )}

          {question.type === 'radio' && (
            <div className="space-y-2">
              {question.options?.map(opt => (
                <label key={opt.value} className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                  <input
                    type="radio"
                    name={question.id}
                    value={opt.value}
                    checked={answers[question.id] === opt.value}
                    onChange={e => handleAnswerChange(question.id, e.target.value)}
                    className="w-4 h-4 text-primary-600"
                  />
                  <span className="text-gray-700">{opt.label}</span>
                </label>
              ))}
            </div>
          )}

          {question.type === 'text' && (
            <input
              type="text"
              value={answers[question.id] || ''}
              onChange={e => handleAnswerChange(question.id, e.target.value)}
              placeholder={question.placeholder}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          )}

          {question.type === 'textarea' && (
            <textarea
              value={answers[question.id] || ''}
              onChange={e => handleAnswerChange(question.id, e.target.value)}
              placeholder={question.placeholder}
              rows={4}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          )}
        </div>
      ))}

      {/* Photo Upload */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Project Photos (optional but helpful)
        </label>
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center cursor-pointer hover:border-primary-400 hover:bg-primary-50 transition-colors"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileChange}
            className="hidden"
          />
          <Camera className="w-10 h-10 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600 font-medium">
            Drop photos here or click to upload
          </p>
          <p className="text-gray-400 text-sm mt-1">
            Up to 10 photos (JPG, PNG)
          </p>
        </div>

        {previews.length > 0 && (
          <div className="grid grid-cols-4 gap-2 mt-4">
            {previews.map((preview, index) => (
              <div key={index} className="relative aspect-square">
                <img
                  src={preview}
                  alt={`Upload ${index + 1}`}
                  className="w-full h-full object-cover rounded-lg"
                />
                <button
                  type="button"
                  onClick={() => removeFile(index)}
                  className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Additional Notes */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Anything else we should know?
        </label>
        <textarea
          value={answers.additionalNotes || ''}
          onChange={e => handleAnswerChange('additionalNotes', e.target.value)}
          placeholder="Timeline, special requests, tile preferences..."
          rows={3}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
      </div>

      {submitError && (
        <div className="rounded-md bg-red-50 p-3">
          <p className="text-sm text-red-700">{submitError}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full btn-cta disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Sending...
          </>
        ) : (
          <>
            <Upload className="w-5 h-5" />
            Get My Free Estimate
          </>
        )}
      </button>

      <p className="text-center text-gray-500 text-sm">
        We typically respond within a few hours.
      </p>
    </form>
  )
}
