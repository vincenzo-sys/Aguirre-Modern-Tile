import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireApiAuth } from '@/lib/apiAuth'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BUCKET = 'job-photos'

function getSupabaseAdmin() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) throw new Error('Supabase not configured')
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
}

// DELETE /api/jobs/[id]/photos/[photoId]
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; photoId: string }> }
) {
  const unauthorized = await requireApiAuth(req)
  if (unauthorized) return unauthorized

  const { id: jobId, photoId } = await params
  if (!/^[0-9a-f-]{36}$/i.test(photoId)) {
    return NextResponse.json({ error: 'Invalid photo id' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const { data: photo, error: fetchErr } = await supabase
    .from('job_photos')
    .select('id, storage_path, job_id')
    .eq('id', photoId)
    .single()
  if (fetchErr || !photo) {
    return NextResponse.json({ error: 'Photo not found' }, { status: 404 })
  }
  if (photo.job_id !== jobId) {
    return NextResponse.json({ error: 'Photo does not belong to this job' }, { status: 403 })
  }

  const { error: deleteErr } = await supabase.from('job_photos').delete().eq('id', photoId)
  if (deleteErr) {
    return NextResponse.json({ error: deleteErr.message }, { status: 500 })
  }
  await supabase.storage.from(BUCKET).remove([photo.storage_path]).catch(() => {})

  return NextResponse.json({ ok: true })
}
