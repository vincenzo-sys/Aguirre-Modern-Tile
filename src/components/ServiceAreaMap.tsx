'use client'

import dynamic from 'next/dynamic'

const ServiceAreaMapInner = dynamic(() => import('./ServiceAreaMapInner'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-gray-100 rounded-xl">
      <p className="text-sm text-gray-500">Loading map...</p>
    </div>
  ),
})

export default function ServiceAreaMap() {
  return (
    <div className="rounded-xl overflow-hidden aspect-video">
      <ServiceAreaMapInner />
    </div>
  )
}
