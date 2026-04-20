import Link from 'next/link'
import { ImageIcon, Filter } from 'lucide-react'
import type { Job, JobPhoto } from '@/lib/supabase/types'

type JobWithPhotos = Pick<Job, 'id' | 'title' | 'job_type' | 'client_address' | 'created_at'> & {
  before_urls: string[]
  after_urls: string[]
}

export default async function GalleryPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>
}) {
  const { type: typeFilter } = await searchParams

  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()

  // Pull completed or paid jobs
  let jobsQuery = supabase
    .from('jobs')
    .select('id, title, job_type, client_address, created_at')
    .in('status', ['completed', 'paid'])
    .order('created_at', { ascending: false })
    .limit(100)

  if (typeFilter && typeFilter !== 'all') {
    jobsQuery = jobsQuery.eq('job_type', typeFilter)
  }

  const { data: jobsRaw } = await jobsQuery
  const jobs = (jobsRaw ?? []) as Pick<Job, 'id' | 'title' | 'job_type' | 'client_address' | 'created_at'>[]

  // Fetch photos for these jobs
  const jobIds = jobs.map((j) => j.id)
  const { data: photosRaw } =
    jobIds.length > 0
      ? await supabase
          .from('job_photos')
          .select('*')
          .in('job_id', jobIds)
      : { data: [] }
  const photos = (photosRaw ?? []) as JobPhoto[]

  // Sign storage URLs
  const photosWithUrls = await Promise.all(
    photos.map(async (p) => {
      const { data } = await supabase.storage
        .from('job-photos')
        .createSignedUrl(p.storage_path, 3600)
      return { ...p, url: data?.signedUrl }
    })
  )

  const byJob: Record<string, { before: string[]; after: string[] }> = {}
  for (const p of photosWithUrls) {
    if (!p.url) continue
    const key = p.job_id
    if (!byJob[key]) byJob[key] = { before: [], after: [] }
    if (p.photo_type === 'after') byJob[key].after.push(p.url)
    else byJob[key].before.push(p.url) // 'before' and 'reference' both go here
  }

  const projects: JobWithPhotos[] = jobs
    .map((j) => ({
      ...j,
      before_urls: byJob[j.id]?.before ?? [],
      after_urls: byJob[j.id]?.after ?? [],
    }))
    .filter((j) => j.before_urls.length + j.after_urls.length > 0)

  // Get available job types from all jobs (not filtered)
  const { data: typesRaw } = await supabase
    .from('jobs')
    .select('job_type')
    .in('status', ['completed', 'paid'])

  const jobTypes = Array.from(
    new Set((typesRaw ?? []).map((r: { job_type: string | null }) => r.job_type).filter(Boolean))
  ).sort() as string[]

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gallery</h1>
          <p className="text-sm text-gray-500 mt-1">
            Past projects to show prospects on site visits. {projects.length} project{projects.length === 1 ? '' : 's'} with photos.
          </p>
        </div>

        {jobTypes.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-4 h-4 text-gray-400" />
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1 flex-wrap">
              <Link
                href="/dashboard/gallery"
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  !typeFilter || typeFilter === 'all'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                All
              </Link>
              {jobTypes.map((t) => (
                <Link
                  key={t}
                  href={`/dashboard/gallery?type=${encodeURIComponent(t)}`}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    typeFilter === t
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {t}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {projects.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <ImageIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No photos yet for {typeFilter && typeFilter !== 'all' ? typeFilter : 'completed jobs'}.</p>
          <p className="text-xs text-gray-400 mt-1">Upload before/after photos on completed jobs and they'll show up here.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {projects.map((project) => {
            const heroAfter = project.after_urls[0]
            const heroBefore = project.before_urls[0]
            return (
              <section
                key={project.id}
                className="bg-white rounded-xl border border-gray-200 overflow-hidden"
              >
                <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h2 className="text-base font-semibold text-gray-900">{project.title}</h2>
                    <p className="text-xs text-gray-500">
                      {project.job_type}
                      {project.client_address && ` · ${project.client_address}`}
                    </p>
                  </div>
                  <Link
                    href={`/dashboard/jobs/${project.id}`}
                    className="text-xs font-medium text-primary-600 hover:underline"
                  >
                    Full job →
                  </Link>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 p-2">
                  <PhotoPane label="Before" urls={project.before_urls} primaryUrl={heroBefore} />
                  <PhotoPane label="After" urls={project.after_urls} primaryUrl={heroAfter} />
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

function PhotoPane({
  label,
  urls,
  primaryUrl,
}: {
  label: string
  urls: string[]
  primaryUrl: string | undefined
}) {
  if (!primaryUrl) {
    return (
      <div className="aspect-video bg-gray-50 rounded-lg flex items-center justify-center text-sm text-gray-400">
        No {label.toLowerCase()} photo
      </div>
    )
  }
  return (
    <div>
      <div className="relative aspect-video overflow-hidden rounded-lg bg-gray-100">
        <span className="absolute top-2 left-2 text-xs font-medium px-2 py-0.5 rounded-full bg-white/90 text-gray-700 z-10">
          {label}
        </span>
        <a href={primaryUrl} target="_blank" rel="noopener">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={primaryUrl}
            alt={label}
            className="w-full h-full object-cover"
          />
        </a>
      </div>
      {urls.length > 1 && (
        <div className="mt-2 grid grid-cols-4 gap-1">
          {urls.slice(1, 5).map((u, i) => (
            <a key={i} href={u} target="_blank" rel="noopener" className="aspect-square overflow-hidden rounded bg-gray-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt={`${label} ${i + 2}`} className="w-full h-full object-cover" />
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
