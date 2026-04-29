'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, Loader2 } from 'lucide-react'
import { toast } from '@/components/Toast'

export default function UploadJobPhotos({
  jobId,
  photoType,
  label,
}: {
  jobId: string
  photoType: 'before' | 'after' | 'reference'
  label: string
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  async function uploadAll(files: File[]) {
    if (files.length === 0) return
    setUploading(true)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      let succeeded = 0
      for (const file of files) {
        const ext = file.name.split('.').pop()
        const path = `${jobId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const { error: upErr } = await supabase.storage
          .from('job-photos')
          .upload(path, file, { cacheControl: '3600' })
        if (upErr) {
          console.error('upload failed', upErr)
          continue
        }
        const { error: insErr } = await supabase.from('job_photos').insert({
          job_id: jobId,
          storage_path: path,
          file_name: file.name,
          photo_type: photoType,
          uploaded_by: user?.id ?? null,
        })
        if (!insErr) succeeded++
      }

      if (succeeded > 0) {
        toast(`Uploaded ${succeeded} photo${succeeded === 1 ? '' : 's'}`)
        router.refresh()
      } else {
        toast('Upload failed', 'error')
      }
    } catch (err) {
      console.error(err)
      toast('Upload failed', 'error')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="inline-flex items-center gap-1.5 px-3 py-2 sm:py-1.5 bg-primary-600 text-white rounded-md text-sm font-medium hover:bg-primary-700 active:scale-95 disabled:opacity-50 transition min-h-[40px] sm:min-h-0"
      >
        {uploading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Upload className="w-4 h-4" />
        )}
        {label}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        onChange={(e) => {
          if (e.target.files) uploadAll(Array.from(e.target.files))
        }}
        className="hidden"
      />
    </>
  )
}
