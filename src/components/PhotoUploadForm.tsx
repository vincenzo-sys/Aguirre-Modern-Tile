'use client'

import { useState, useRef, useEffect } from 'react'
import { Upload, X, Camera, Check, Loader2 } from 'lucide-react'
import { toast } from '@/components/Toast'
import { validateContact } from '@/lib/validation'
import { uploadQuotePhotos } from '@/lib/uploadQuotePhotos'

export default function PhotoUploadForm() {
  const [files, setFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    description: '',
  })

  // Pre-fill the description from ?description=... when the user arrives here
  // from the QuoteCalculator. Saves them re-typing what they just told us.
  // Reading window.location avoids needing a Suspense boundary that
  // useSearchParams would require under static rendering.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const desc = new URLSearchParams(window.location.search).get('description')
    if (desc) {
      setFormData((prev) => (prev.description ? prev : { ...prev, description: desc }))
    }
  }, [])
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || [])
    if (selectedFiles.length + files.length > 10) {
      toast('Maximum 10 photos allowed', 'warning')
      return
    }

    setFiles((prev) => [...prev, ...selectedFiles])

    selectedFiles.forEach((file) => {
      const reader = new FileReader()
      reader.onloadend = () => {
        setPreviews((prev) => [...prev, reader.result as string])
      }
      reader.readAsDataURL(file)
    })
  }

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
    setPreviews((prev) => prev.filter((_, i) => i !== index))
  }

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    if (fieldErrors[name]) {
      setFieldErrors(prev => { const next = { ...prev }; delete next[name]; return next })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError('')

    const errors = validateContact(formData)
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }

    setIsSubmitting(true)

    try {
      // Run /api/quotes (creates quote_requests row + customer) and /api/contact
      // (sends Vince the email + customer confirmation) in parallel. We need
      // the quote id to attach photos, so we await both.
      const payload = {
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        // /api/contact treats this as the project description; /api/quotes
        // stores it inside answers.description.
        description: formData.description,
        // /api/quotes requires projectType — contact form doesn't ask, so
        // use 'other' and let the description carry the detail.
        projectType: 'other',
        source: 'quote',
        answers: formData.description ? { description: formData.description } : {},
      }

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

      // Upload photos via signed-URL flow (direct browser → Supabase). The
      // lead is already saved, so a flaky upload shouldn't block the success
      // state — but unlike the old multipart endpoint, we now surface per-
      // file failures so the user knows if a photo didn't make it.
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
    } catch {
      setIsSubmitting(false)
      setSubmitError('Something went wrong. Please call us at (617) 766-1259.')
    }
  }

  if (isSubmitted) {
    const firstName = formData.name.split(' ')[0] || ''
    const photoNote = files.length > 0
      ? `We've got your ${files.length} photo${files.length === 1 ? '' : 's'} — `
      : ''
    return (
      <div className="bg-green-50 rounded-2xl p-8 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Check className="w-8 h-8 text-green-600" />
        </div>
        <h3 className="text-xl font-bold text-gray-900 mb-2">
          Got it{firstName ? `, ${firstName}` : ''} — request received
        </h3>
        <p className="text-gray-600 mb-4">
          {photoNote}a confirmation is heading to your inbox and phone. Vince will
          review the details and send a written estimate the same day.
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

  const inputBase =
    'w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500'

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Photo Upload Area */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Project Photos
        </label>
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-primary-400 hover:bg-primary-50 transition-colors"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileChange}
            className="hidden"
          />
          <Camera className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 font-medium">
            Drop photos here or click to upload
          </p>
          <p className="text-gray-400 text-sm mt-1">
            Up to 10 photos (JPG, PNG)
          </p>
        </div>

        {previews.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mt-4">
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

      {/* Contact Fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Your Name *
          </label>
          <input
            type="text"
            name="name"
            required
            value={formData.name}
            onChange={handleInputChange}
            className={`${inputBase} ${fieldErrors.name ? 'border-red-400' : 'border-gray-300'}`}
            placeholder="John Smith"
          />
          {fieldErrors.name && <p className="mt-1 text-sm text-red-600">{fieldErrors.name}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Phone Number *
          </label>
          <input
            type="tel"
            name="phone"
            required
            value={formData.phone}
            onChange={handleInputChange}
            className={`${inputBase} ${fieldErrors.phone ? 'border-red-400' : 'border-gray-300'}`}
            placeholder="(617) 555-1234"
          />
          {fieldErrors.phone && <p className="mt-1 text-sm text-red-600">{fieldErrors.phone}</p>}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Email Address *
        </label>
        <input
          type="email"
          name="email"
          required
          value={formData.email}
          onChange={handleInputChange}
          className={`${inputBase} ${fieldErrors.email ? 'border-red-400' : 'border-gray-300'}`}
          placeholder="john@example.com"
        />
        {fieldErrors.email && <p className="mt-1 text-sm text-red-600">{fieldErrors.email}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Project Description
        </label>
        <textarea
          name="description"
          rows={4}
          value={formData.description}
          onChange={handleInputChange}
          className={`${inputBase} border-gray-300`}
          placeholder="Tell us about your project: What are you looking to do? Any specific tile preferences? Timeline?"
        />
      </div>

      {submitError && (
        <div className="rounded-md bg-red-50 p-3">
          <p className="text-sm text-red-700">{submitError}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={isSubmitting || !formData.name || !formData.phone || !formData.email}
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
            Get Your Free Estimate
          </>
        )}
      </button>

      <p className="text-center text-gray-500 text-sm">
        We answer in 5 minutes — written estimate same day.
      </p>
    </form>
  )
}
