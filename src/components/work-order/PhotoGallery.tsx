'use client'

// Site-photo grid with an in-page lightbox. The crew taps a thumbnail and the
// photo opens full-screen over the work order (instead of a new browser tab,
// which lost the work-order context). Swipe or tap the arrows to page between
// photos; tap the backdrop / X / Esc to close. Native pinch-zoom works on the
// image inside the overlay. Kept a small client island so the rest of the page
// stays server-rendered. Overlay mirrors the ui/ConfirmDialog full-screen
// pattern (fixed inset-0, backdrop dismiss, Esc).

import { useEffect, useRef, useState } from 'react'
import { ImageIcon, X, ChevronLeft, ChevronRight } from 'lucide-react'

type Photo = { url: string; caption: string | null }

export default function PhotoGallery({ photos }: { photos: Photo[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const touchStartX = useRef<number | null>(null)

  const isOpen = openIndex !== null

  useEffect(() => {
    if (!isOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenIndex(null)
      else if (e.key === 'ArrowRight') setOpenIndex((i) => (i === null ? i : (i + 1) % photos.length))
      else if (e.key === 'ArrowLeft') setOpenIndex((i) => (i === null ? i : (i - 1 + photos.length) % photos.length))
    }
    document.addEventListener('keydown', onKey)
    // Lock background scroll while the lightbox is open.
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [isOpen, photos.length])

  if (photos.length === 0) return null

  function go(delta: number) {
    setOpenIndex((i) => (i === null ? i : (i + delta + photos.length) % photos.length))
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    touchStartX.current = null
    if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1)
  }

  return (
    <section id="photos" className="bg-white rounded-xl border border-gray-200 p-5 scroll-mt-16">
      <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3 flex items-center gap-2">
        <ImageIcon className="w-4 h-4 text-gray-500" />
        Site photos ({photos.length})
      </h2>
      <div className="grid grid-cols-3 gap-2">
        {photos.map((photo, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setOpenIndex(i)}
            className="block aspect-square overflow-hidden rounded-lg bg-gray-100 border border-gray-200 active:opacity-80"
            title={photo.caption ?? 'Site photo'}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.url}
              alt={photo.caption ?? 'Site photo'}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </button>
        ))}
      </div>

      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Site photo"
          className="fixed inset-0 z-[120] flex flex-col bg-black/90"
          onClick={() => setOpenIndex(null)}
        >
          {/* Top bar: counter + close */}
          <div className="flex items-center justify-between px-4 py-3 text-white/90 pt-[env(safe-area-inset-top)]">
            <span className="text-sm tabular-nums">{(openIndex ?? 0) + 1} / {photos.length}</span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setOpenIndex(null) }}
              aria-label="Close"
              className="p-2 -mr-2 rounded-full hover:bg-white/10"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Image — swipeable; native pinch-zoom allowed */}
          <div
            className="flex-1 flex items-center justify-center overflow-hidden px-2"
            style={{ touchAction: 'pinch-zoom' }}
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX }}
            onTouchEnd={onTouchEnd}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photos[openIndex ?? 0].url}
              alt={photos[openIndex ?? 0].caption ?? 'Site photo'}
              className="max-h-full max-w-full object-contain select-none"
              draggable={false}
            />
          </div>

          {/* Caption */}
          {photos[openIndex ?? 0].caption && (
            <p className="text-center text-white/80 text-sm px-4 pb-2" onClick={(e) => e.stopPropagation()}>
              {photos[openIndex ?? 0].caption}
            </p>
          )}

          {/* Prev / next — hidden when there's only one photo */}
          {photos.length > 1 && (
            <div
              className="flex items-center justify-between px-4 pb-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => go(-1)}
                aria-label="Previous photo"
                className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-white/10 text-white hover:bg-white/20 active:scale-95"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button
                type="button"
                onClick={() => go(1)}
                aria-label="Next photo"
                className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-white/10 text-white hover:bg-white/20 active:scale-95"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
