// Shared client helper for uploading photos attached to a quote_request.
//
// Three-step protocol (introduced 2026-05-11 — see /api/quotes/[id]/photos/sign
// for the why):
//   1) POST /api/quotes/[id]/photos/sign with file metadata → signed URLs
//   2) PUT each file directly to its signed URL (browser → Supabase Storage)
//   3) POST /api/quotes/[id]/photos with the completed paths to record DB rows
//
// Returns a per-file result so the caller can show a precise error to the
// user instead of swallowing failures (the old endpoint silently 413'd
// for any photo over ~4 MB and the form said "Got it!" anyway).

export type PhotoUploadResult = {
  ok: boolean
  file_name: string
  error?: string
}

type SignResponse = {
  uploads: Array<{
    ok: boolean
    file_name: string
    storage_path?: string
    signed_url?: string
    token?: string
    error?: string
  }>
}

export async function uploadQuotePhotos(
  quoteId: string,
  files: File[]
): Promise<PhotoUploadResult[]> {
  if (files.length === 0) return []

  // 1) Ask the server for signed upload URLs.
  const signRes = await fetch(`/api/quotes/${quoteId}/photos/sign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      files: files.map((f) => ({ name: f.name, type: f.type, size: f.size })),
    }),
  })
  if (!signRes.ok) {
    const reason = await signRes.text().catch(() => 'sign request failed')
    return files.map((f) => ({ ok: false, file_name: f.name, error: reason }))
  }
  const signData = (await signRes.json()) as SignResponse

  // 2) Upload each file directly to Supabase Storage. Sequential rather
  // than parallel — keeps memory pressure on Christian's phone reasonable
  // when he's uploading 10 photos in the field on LTE, and avoids hammering
  // the storage endpoint with concurrent PUTs.
  const recorded: Array<{
    storage_path: string
    file_name: string
    mime_type: string
    size_bytes: number
  }> = []
  const results: PhotoUploadResult[] = []

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const slot = signData.uploads[i]
    if (!slot || !slot.ok || !slot.signed_url || !slot.storage_path) {
      results.push({ ok: false, file_name: file.name, error: slot?.error ?? 'no upload slot' })
      continue
    }

    try {
      const putRes = await fetch(slot.signed_url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      })
      if (!putRes.ok) {
        const txt = await putRes.text().catch(() => '')
        results.push({
          ok: false,
          file_name: file.name,
          error: `upload failed (${putRes.status})${txt ? `: ${txt.slice(0, 120)}` : ''}`,
        })
        continue
      }
      recorded.push({
        storage_path: slot.storage_path,
        file_name: slot.file_name,
        mime_type: file.type,
        size_bytes: file.size,
      })
      results.push({ ok: true, file_name: file.name })
    } catch (err) {
      results.push({
        ok: false,
        file_name: file.name,
        error: err instanceof Error ? err.message : 'upload threw',
      })
    }
  }

  // 3) Record successful uploads in the DB. If this fails the photos are
  // already in storage — orphaned objects, but harmless. The recorder is
  // idempotent on storage_path implicitly (DB row insert just fails
  // gracefully if rerun).
  if (recorded.length > 0) {
    try {
      await fetch(`/api/quotes/${quoteId}/photos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: recorded }),
      })
    } catch (err) {
      console.error('Photo record step failed:', err)
      // Don't downgrade the per-file results — the upload itself succeeded.
    }
  }

  return results
}
