import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireApiAuth } from '@/lib/apiAuth'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BUCKET = 'quote-photos'

function getSupabaseAdmin() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) throw new Error('Supabase not configured')
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
}

// DELETE /api/quotes/[id]/photos/[photoId]
// Removes a quote_request_photos row and best-effort deletes the storage
// object. Auth required — only dashboard users delete photos; the public
// POST upload path can't reach this. Idempotent: 404 if the photo is
// already gone, so re-clicking delete after a refresh doesn't error.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; photoId: string }> }
) {
  const unauthorized = await requireApiAuth(req)
  if (unauthorized) return unauthorized

  const { id: quoteId, photoId } = await params
  if (!/^[0-9a-f-]{36}$/i.test(photoId)) {
    return NextResponse.json({ error: 'Invalid photo id' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const { data: photo, error: fetchErr } = await supabase
    .from('quote_request_photos')
    .select('id, storage_path, quote_request_id')
    .eq('id', photoId)
    .single()

  if (fetchErr || !photo) {
    return NextResponse.json({ error: 'Photo not found' }, { status: 404 })
  }
  if (photo.quote_request_id !== quoteId) {
    return NextResponse.json({ error: 'Photo does not belong to this quote' }, { status: 403 })
  }

  const { error: deleteErr } = await supabase
    .from('quote_request_photos')
    .delete()
    .eq('id', photoId)
  if (deleteErr) {
    return NextResponse.json({ error: deleteErr.message }, { status: 500 })
  }

  // Best-effort storage cleanup. If this fails the row is already gone, so
  // a stale storage object isn't user-visible — it just costs a few bytes.
  await supabase.storage.from(BUCKET).remove([photo.storage_path]).catch(() => {})

  return NextResponse.json({ ok: true })
}
