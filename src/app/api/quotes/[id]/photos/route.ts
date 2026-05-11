import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { rateLimit } from '@/lib/validation'
import { requireApiAuth } from '@/lib/apiAuth'

// POST /api/quotes/[id]/photos — RECORDER (since 2026-05-11).
//
// Previously this endpoint accepted multipart/form-data and proxied the
// bytes through Vercel to Supabase Storage. That silently failed for any
// photo over ~4 MB because Vercel functions cap request bodies at 4.5 MB —
// the entire production history had exactly one successful upload (131 KB).
//
// New shape: client first hits /sign to get signed upload URLs, uploads
// each file *directly* to Supabase Storage from the browser, then posts
// back here with the completed paths. We verify the objects actually exist
// in storage (so callers can't insert bogus row pointers) and write the
// quote_request_photos rows.
//
// Body: { items: [{ storage_path, file_name, mime_type, size_bytes }] }

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BUCKET = 'quote-photos'

function getSupabaseAdmin() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error('Supabase not configured')
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
}

type Item = {
  storage_path: string
  file_name: string
  mime_type: string
  size_bytes: number
}

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
    const items = Array.isArray(body?.items) ? (body.items as Item[]) : null
    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'No items provided' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    // Verify the quote_request exists.
    const { data: quote, error: quoteErr } = await supabase
      .from('quote_requests')
      .select('id')
      .eq('id', quoteId)
      .single()
    if (quoteErr || !quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
    }

    const inserted: Array<{ id: string; file_name: string }> = []
    const failures: string[] = []

    for (const it of items) {
      // Defense in depth: every storage path the client claims must live
      // under {quoteId}/, otherwise this is a recorder for a different
      // quote's upload and we refuse.
      if (typeof it.storage_path !== 'string' || !it.storage_path.startsWith(`${quoteId}/`)) {
        failures.push(`${it.file_name ?? 'unknown'}: invalid path`)
        continue
      }

      // Verify the object actually exists in storage. Cheap call; protects
      // against the recorder inserting a row for an upload that 4xx'd.
      const folder = quoteId
      const filename = it.storage_path.slice(folder.length + 1)
      const { data: listing } = await supabase.storage.from(BUCKET).list(folder, {
        search: filename,
        limit: 1,
      })
      if (!listing || listing.length === 0) {
        failures.push(`${it.file_name}: object not found in storage`)
        continue
      }

      const { data: row, error } = await supabase
        .from('quote_request_photos')
        .insert({
          quote_request_id: quoteId,
          storage_path: it.storage_path,
          file_name: it.file_name,
          mime_type: it.mime_type,
          size_bytes: it.size_bytes,
        })
        .select('id, file_name')
        .single()

      if (error || !row) {
        console.error('quote_request_photos insert error:', error?.message)
        failures.push(`${it.file_name}: record failed`)
        continue
      }
      inserted.push(row)
    }

    return NextResponse.json({
      recorded: inserted.length,
      failed: failures.length,
      failures: failures.length > 0 ? failures : undefined,
      photos: inserted,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Quote photos POST error:', message)
    return NextResponse.json({ error: 'Record failed' }, { status: 500 })
  }
}

// GET /api/quotes/[id]/photos — Authenticated dashboard read with signed URLs.
// (Unchanged from previous implementation.)
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
