import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { requireApiAuth } from '@/lib/apiAuth'

// Job-photos endpoint — parallel of /api/quotes/[id]/photos for the
// case where a lead was created via "Start working this lead" and has
// no quote_request to attach photos to. Same shape, different table
// (job_photos) and bucket (job-photos), so the leads workspace can
// route to whichever id type the record has.
//
// Both endpoints require auth — there's no public job-photos upload
// path (the customer-facing version still uses quote-photos via the
// website form).

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BUCKET = 'job-photos'
const MAX_FILE_BYTES = 10 * 1024 * 1024
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])

function getSupabaseAdmin() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) throw new Error('Supabase not configured')
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
}

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)
}

// POST /api/jobs/[id]/photos — multipart/form-data with `photos` files.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireApiAuth(req)
  if (unauthorized) return unauthorized

  try {
    const { id: jobId } = await params
    if (!/^[0-9a-f-]{36}$/i.test(jobId)) {
      return NextResponse.json({ error: 'Invalid job id' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data: job, error: jobErr } = await supabase
      .from('jobs')
      .select('id')
      .eq('id', jobId)
      .single()
    if (jobErr || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    const form = await req.formData()
    const files = form.getAll('photos').filter((v): v is File => v instanceof File)
    if (files.length === 0) {
      return NextResponse.json({ error: 'No photos provided' }, { status: 400 })
    }
    if (files.length > 10) {
      return NextResponse.json({ error: 'Maximum 10 photos per upload' }, { status: 400 })
    }

    const uploaded: Array<{ id: string; file_name: string }> = []
    const failures: string[] = []

    for (const file of files) {
      if (file.size > MAX_FILE_BYTES) {
        failures.push(`${file.name}: too large`)
        continue
      }
      if (!ALLOWED_MIME.has(file.type)) {
        failures.push(`${file.name}: unsupported type`)
        continue
      }

      const fileName = safeName(file.name || 'photo.jpg')
      const storagePath = `${jobId}/${randomUUID()}-${fileName}`

      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, file, { contentType: file.type, upsert: false })
      if (uploadErr) {
        console.error('Job photo upload error:', uploadErr.message)
        failures.push(`${file.name}: upload failed`)
        continue
      }

      const { data: row, error: insertErr } = await supabase
        .from('job_photos')
        .insert({
          job_id: jobId,
          storage_path: storagePath,
          file_name: fileName,
        })
        .select('id, file_name')
        .single()

      if (insertErr || !row) {
        console.error('Job photo row insert error:', insertErr?.message)
        await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {})
        failures.push(`${file.name}: record failed`)
        continue
      }

      uploaded.push(row)
    }

    return NextResponse.json({
      uploaded: uploaded.length,
      failed: failures.length,
      failures: failures.length > 0 ? failures : undefined,
      photos: uploaded,
    })
  } catch (err) {
    console.error('Job photos POST error:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}

// GET /api/jobs/[id]/photos — list rows + 1-hour signed URLs.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireApiAuth(req)
  if (unauthorized) return unauthorized

  try {
    const { id: jobId } = await params
    const supabase = getSupabaseAdmin()
    const { data: photos, error } = await supabase
      .from('job_photos')
      .select('*')
      .eq('job_id', jobId)
      .order('created_at', { ascending: true })
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    const withUrls = await Promise.all(
      (photos ?? []).map(async (photo) => {
        const { data: signed } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(photo.storage_path, 3600)
        return { ...photo, url: signed?.signedUrl ?? null }
      })
    )
    return NextResponse.json(withUrls)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
