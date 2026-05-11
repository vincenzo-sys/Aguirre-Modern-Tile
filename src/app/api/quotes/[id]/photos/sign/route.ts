import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { rateLimit } from '@/lib/validation'

// POST /api/quotes/[id]/photos/sign
//
// Why this exists: Vercel serverless functions cap request bodies at 4.5 MB.
// iPhone photos at full resolution are 2–5 MB *each*, so the original
// /api/quotes/[id]/photos POST (which streamed multipart bytes through this
// function) silently 413'd for any real-world submission. The fingerprint in
// production: thousands of leads, exactly one photo in the DB — and that
// photo was 131 KB.
//
// New flow:
//   1. Client calls THIS endpoint with file metadata (name, type, size). We
//      validate, generate per-file storage paths, and return signed URLs
//      the *browser* can PUT directly to Supabase Storage with — the bytes
//      never touch Vercel.
//   2. Client uploads each file to its signed URL.
//   3. Client POSTs to /api/quotes/[id]/photos (now JSON, not multipart) to
//      record the completed uploads in quote_request_photos.
//
// Public endpoint (no auth) — the only authorization is possession of the
// quote_request UUID, which is the same model the rest of /api/quotes uses.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BUCKET = 'quote-photos'
const MAX_FILE_BYTES = 25 * 1024 * 1024 // 25 MB — generous; even 4K HEIC fits.
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
])

function getSupabaseAdmin() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error('Supabase not configured')
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
}

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)
}

type FileMeta = { name: string; type: string; size: number }

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const limit = rateLimit(ip, { maxRequests: 30, windowMs: 60_000 })
    if (!limit.allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const { id: quoteId } = await params
    if (!/^[0-9a-f-]{36}$/i.test(quoteId)) {
      return NextResponse.json({ error: 'Invalid quote id' }, { status: 400 })
    }

    const body = await req.json().catch(() => null)
    const files = Array.isArray(body?.files) ? (body.files as FileMeta[]) : null
    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    }
    if (files.length > 10) {
      return NextResponse.json({ error: 'Maximum 10 photos per submission' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    // Verify the quote_request exists. Anonymous callers shouldn't be able
    // to mint signed URLs for arbitrary UUIDs.
    const { data: quote, error: quoteErr } = await supabase
      .from('quote_requests')
      .select('id')
      .eq('id', quoteId)
      .single()
    if (quoteErr || !quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
    }

    type Upload = {
      ok: boolean
      file_name: string
      storage_path?: string
      signed_url?: string
      token?: string
      error?: string
    }
    const uploads: Upload[] = []

    for (const f of files) {
      if (!f || typeof f.name !== 'string' || typeof f.type !== 'string' || typeof f.size !== 'number') {
        uploads.push({ ok: false, file_name: String(f?.name ?? ''), error: 'Invalid metadata' })
        continue
      }
      if (!ALLOWED_MIME.has(f.type)) {
        uploads.push({ ok: false, file_name: f.name, error: 'Unsupported file type' })
        continue
      }
      if (f.size > MAX_FILE_BYTES) {
        uploads.push({ ok: false, file_name: f.name, error: 'File too large (25 MB max)' })
        continue
      }

      const fileName = safeName(f.name || 'photo.jpg')
      const storagePath = `${quoteId}/${randomUUID()}-${fileName}`

      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUploadUrl(storagePath)

      if (error || !data) {
        console.error('createSignedUploadUrl error:', error?.message)
        uploads.push({ ok: false, file_name: fileName, error: 'Failed to issue upload URL' })
        continue
      }

      uploads.push({
        ok: true,
        file_name: fileName,
        storage_path: storagePath,
        signed_url: data.signedUrl,
        token: data.token,
      })
    }

    return NextResponse.json({ uploads })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Quote photos /sign error:', message)
    return NextResponse.json({ error: 'Failed to prepare upload' }, { status: 500 })
  }
}
