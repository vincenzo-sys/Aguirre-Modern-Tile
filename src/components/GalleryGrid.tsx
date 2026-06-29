'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { X, ChevronLeft, ChevronRight, ArrowLeftRight } from 'lucide-react'
import BeforeAfterSlider from '@/components/BeforeAfterSlider'

export type GalleryProject = {
  id: number
  image: string
  title: string
  category: string
  // When present, the tile/lightbox renders an interactive before→after
  // slider (image = the "after" shot). Absent for single-photo projects.
  beforeImage?: string | null
}

// Fixed display order for category filter chips; only categories actually
// present in the data render. Keeps the filter bar stable regardless of CMS
// ordering.
const CATEGORY_ORDER = ['Bathroom', 'Shower', 'Floor', 'Backsplash', 'Repair', 'Reglazing', 'Other']

const BEFORE_AFTER_FILTER = 'Before/After'

export default function GalleryGrid({ projects }: { projects: GalleryProject[] }) {
  const [active, setActive] = useState<string>('All')
  const [lightboxId, setLightboxId] = useState<number | null>(null)

  const hasPairs = projects.some((p) => p.beforeImage)

  const categories = [
    'All',
    ...CATEGORY_ORDER.filter((c) => projects.some((p) => p.category === c)),
    ...(hasPairs ? [BEFORE_AFTER_FILTER] : []),
  ]

  const filtered = projects.filter((p) => {
    if (active === 'All') return true
    if (active === BEFORE_AFTER_FILTER) return !!p.beforeImage
    return p.category === active
  })

  // Lightbox navigation operates over the currently filtered list so prev/next
  // stays within what the user is browsing.
  const lightboxIndex = filtered.findIndex((p) => p.id === lightboxId)
  const current = lightboxIndex >= 0 ? filtered[lightboxIndex] : null

  const close = useCallback(() => setLightboxId(null), [])
  const go = useCallback(
    (dir: 1 | -1) => {
      if (filtered.length === 0 || lightboxIndex < 0) return
      const next = (lightboxIndex + dir + filtered.length) % filtered.length
      setLightboxId(filtered[next].id)
    },
    [filtered, lightboxIndex]
  )

  useEffect(() => {
    if (!current) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    // Lock body scroll while the lightbox is open.
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [current, close, go])

  return (
    <>
      {/* Filter chips */}
      <div className="flex flex-wrap gap-2 mb-8">
        {categories.map((cat) => {
          const isActive = active === cat
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setActive(cat)}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {cat === BEFORE_AFTER_FILTER && <ArrowLeftRight className="w-3.5 h-3.5" />}
              {cat}
            </button>
          )
        })}
      </div>

      {/* Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filtered.map((project) => (
          <button
            key={project.id}
            type="button"
            onClick={() => setLightboxId(project.id)}
            className="group relative aspect-[4/3] rounded-xl overflow-hidden shadow-sm text-left focus:outline-none focus:ring-2 focus:ring-primary-500"
            aria-label={`View ${project.title}`}
          >
            <Image
              src={project.image}
              alt={project.title}
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1280px) 33vw, 25vw"
              className="object-cover group-hover:scale-105 transition-transform duration-300"
            />
            {project.beforeImage && (
              <span className="absolute top-3 left-3 inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 bg-white/90 text-gray-800 rounded-full shadow-sm">
                <ArrowLeftRight className="w-3 h-3" />
                Before / After
              </span>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="absolute bottom-0 left-0 right-0 p-4">
                <span className="text-xs font-medium px-2 py-1 bg-primary-500 text-white rounded-full">
                  {project.category}
                </span>
                <h3 className="text-white font-semibold mt-2">{project.title}</h3>
              </div>
            </div>
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-center text-gray-500 py-12">No projects in this category yet.</p>
      )}

      {/* Lightbox */}
      {current && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 sm:p-8"
          onClick={close}
          role="dialog"
          aria-modal="true"
          aria-label={current.title}
        >
          {/* Close */}
          <button
            type="button"
            onClick={close}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Prev / Next */}
          {filtered.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); go(-1) }}
                className="absolute left-2 sm:left-4 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
                aria-label="Previous"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); go(1) }}
                className="absolute right-2 sm:right-4 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
                aria-label="Next"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </>
          )}

          {/* Content — stopPropagation so clicking the image doesn't close. */}
          <div
            className="relative w-full max-w-4xl"
            onClick={(e) => e.stopPropagation()}
          >
            {current.beforeImage ? (
              <BeforeAfterSlider beforeImage={current.beforeImage} afterImage={current.image} />
            ) : (
              <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden bg-gray-900">
                <Image
                  src={current.image}
                  alt={current.title}
                  fill
                  sizes="(max-width: 896px) 100vw, 896px"
                  className="object-contain"
                />
              </div>
            )}
            <div className="mt-3 flex items-center justify-between gap-4">
              <div>
                <h3 className="text-white font-semibold">{current.title}</h3>
                <span className="text-xs text-gray-300">{current.category}</span>
              </div>
              <a
                href="/"
                className="hidden sm:inline-flex items-center px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-semibold"
              >
                Get a free estimate
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
