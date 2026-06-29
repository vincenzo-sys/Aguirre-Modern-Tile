'use client'

import { useState, useEffect, useRef } from 'react'
import { Upload, X, Camera, Check, Loader2, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { toast } from '@/components/Toast'
import { validateContact } from '@/lib/validation'
import { uploadQuotePhotos } from '@/lib/uploadQuotePhotos'

interface Question {
  id: string
  label: string
  type: 'select' | 'radio' | 'text' | 'textarea' | 'number'
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

    const errors = validateContact(contactInfo, { requireEmail: false })
    if (Object.keys(errors).length > 0) {
      toast('Please check your contact info on the previous step.', 'warning')
      return
    }

    setIsSubmitting(true)

    try {
      // If the visitor arrived via a /refer/<code> link, attach the code so
      // /api/quotes can credit the referrer (referred_by_customer_id).
      let referralCode: string | null = null
      try {
        referralCode = localStorage.getItem('referralCode')
      } catch {
        // storage disabled — no attribution
      }

      const payload = {
        name: contactInfo.name,
        email: contactInfo.email,
        phone: contactInfo.phone,
        projectType,
        answers,
        source: 'quote',
        ...(referralCode ? { referralCode } : {}),
      }

      // Send email notification and save to database in parallel
      const [emailRes, quoteRes] = await Promise.all([
        fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }),
        fetch('/api/quotes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }),
      ])

      if (!emailRes.ok && !quoteRes.ok) throw new Error('Failed to send')

      // Upload photos via signed-URL flow (direct browser → Supabase). See
      // src/lib/uploadQuotePhotos.ts for the why. Per-file failures are
      // surfaced to the user; the lead is already saved either way.
      if (files.length > 0 && quoteRes.ok) {
        try {
          const quoteData = await quoteRes.clone().json()
          const quoteId = quoteData?.id as string | undefined
          if (quoteId) {
            const results = await uploadQuotePhotos(quoteId, files)
            const failed = results.filter((r) => !r.ok)
            if (failed.length > 0) {
              const names = failed.map((f) => f.file_name).join(', ')
              toast(`${failed.length} photo${failed.length === 1 ? '' : 's'} failed to upload: ${names}`, 'warning')
            }
          }
        } catch (err) {
          console.error('Photo upload failed:', err)
          toast('Photos could not be uploaded. Vince will follow up.', 'warning')
        }
      }

      setIsSubmitting(false)
      setIsSubmitted(true)
      localStorage.removeItem('leadContact')
      localStorage.removeItem('referralCode')
    } catch {
      setIsSubmitting(false)
      setSubmitError('Something went wrong. Please call us at (617) 766-1259.')
    }
  }

  if (isSubmitted) {
    const firstName = contactInfo.name.split(' ')[0] || ''
    return (
      <div className="bg-green-50 rounded-2xl p-6 sm:p-8 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Check className="w-8 h-8 text-green-600" />
        </div>
        <h3 className="text-xl font-bold text-gray-900 mb-2">
          Got it{firstName ? `, ${firstName}` : ''} — request received
        </h3>
        <p className="text-gray-700 mb-5">
          A confirmation is heading to your inbox and phone now. I&apos;ll review
          the {projectTitle.toLowerCase()} details and send a written estimate the same day —
          usually within a couple hours.
        </p>

        <div className="bg-white rounded-lg border border-green-200 p-4 mb-5 text-left">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">What happens next</p>
          <ol className="space-y-1.5 text-sm text-gray-700">
            <li><span className="font-semibold text-green-700">1.</span> I review your photos &amp; project details</li>
            <li><span className="font-semibold text-green-700">2.</span> You get a written estimate by email + text</li>
            <li><span className="font-semibold text-green-700">3.</span> 10% deposit reserves your install date</li>
          </ol>
        </div>

        <p className="text-sm text-gray-500 mb-4">
          We&apos;ll reach you at {contactInfo.phone}
          {contactInfo.email ? ` or ${contactInfo.email}` : ''}.
        </p>

        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <a
            href="sms:+16177661259"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white text-primary-700 border-2 border-primary-600 rounded-lg font-semibold text-sm hover:bg-primary-50 active:scale-95 transition"
          >
            Text Vince directly
          </a>
          <a
            href="tel:+16177661259"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg font-semibold text-sm hover:bg-primary-700 active:scale-95 transition"
          >
            Call (617) 766-1259
          </a>
        </div>
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
        <p className="text-sm text-gray-600">
          {contactInfo.email ? `${contactInfo.email} • ` : ''}
          {contactInfo.phone}
        </p>
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

          {question.type === 'number' && (
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
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
            capture="environment"
            multiple
            onChange={handleFileChange}
            className="hidden"
          />
          <Camera className="w-10 h-10 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600 font-medium">
            <span className="sm:hidden">Take photos with your camera</span>
            <span className="hidden sm:inline">Drop photos here or click to upload</span>
          </p>
          <p className="text-gray-400 text-sm mt-1">
            Up to 10 photos (JPG, PNG)
          </p>
        </div>

        {previews.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-4">
            {previews.map((preview, index) => (
              <div key={index} className="relative aspect-square">
                <img
                  src={preview}
                  alt={`Upload ${index + 1}`}
                  className="w-full h-full object-cover rounded-lg"
                />
                <button
                  type="button"
                  aria-label={`Remove photo ${index + 1}`}
                  onClick={() => removeFile(index)}
                  className="absolute -top-2 -right-2 w-7 h-7 bg-red-500 text-white rounded-full flex items-center justify-center shadow-md hover:bg-red-600 active:scale-95 transition"
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
        We answer in 5 minutes — written estimate the same day.
      </p>
    </form>
  )
}
