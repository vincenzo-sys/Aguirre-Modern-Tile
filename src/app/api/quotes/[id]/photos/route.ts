import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { rateLimit } from '@/lib/validation'
import { requireApiAuth } from '@/lib/apiAuth'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BUCKET = 'quote-photos'
const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10 MB per photo
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])

function getSupabaseAdmin() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error('Supabase not configured')
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
}

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)
}

// POST /api/quotes/[id]/photos
// Public endpoint — accepts multipart/form-data from the website quote form
// after the quote_request row has been created. Uploads to the private
// 'quote-photos' bucket and inserts rows into quote_request_photos.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const limit = rateLimit(ip, { maxRequests: 20, windowMs: 60_000 })
    if (!limit.allowed) {
      return NextResponse.json({ error: 'Too many uploads. Try again in a moment.' }, { status: 429 })
    }

    const { id: quoteId } = await params
    if (!/^[0-9a-f-]{36}$/i.test(quoteId)) {
      return NextResponse.json({ error: 'Invalid quote id' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    // Verify the quote_request exists so anonymous callers can't create
    // orphaned storage objects under arbitrary UUIDs.
    const { data: quote, error: quoteErr } = await supabase
      .from('quote_requests')
      .select('id')
      .eq('id', quoteId)
      .single()
    if (quoteErr || !quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
    }

    const form = await req.formData()
    const files = form.getAll('photos').filter((v): v is File => v instanceof File)

    if (files.length === 0) {
      return NextResponse.json({ error: 'No photos provided' }, { status: 400 })
    }
    if (files.length > 10) {
      return NextResponse.json({ error: 'Maximum 10 photos per submission' }, { status: 400 })
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
      const storagePath = `${quoteId}/${randomUUID()}-${fileName}`

      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, file, {
          contentType: file.type,
          upsert: false,
        })

      if (uploadErr) {
        console.error('Quote photo upload error:', uploadErr.message)
        failures.push(`${file.name}: upload failed`)
        continue
      }

      const { data: row, error: insertErr } = await supabase
        .from('quote_request_photos')
        .insert({
          quote_request_id: quoteId,
          storage_path: storagePath,
          file_name: fileName,
          mime_type: file.type,
          size_bytes: file.size,
        })
        .select('id, file_name')
        .single()

      if (insertErr || !row) {
        console.error('Quote photo row insert error:', insertErr?.message)
        // Best-effort cleanup so we don't leave orphans in storage.
        await supabase.storage.from(BUCKET).remove([storagePath])
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
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Quote photos POST error:', message)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}

// GET /api/quotes/[id]/photos
// Authenticated dashboard route — returns photo rows with short-lived signed URLs.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireApiAuth(req)
  if (unauthorized) return unauthorized

  try {
    const { id: quoteId } = await params
    const supabase = getSupabaseAdmin()

    const { data: photos, error } = await supabase
      .from('quote_request_photos')
      .select('*')
      .eq('quote_request_id', quoteId)
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
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
