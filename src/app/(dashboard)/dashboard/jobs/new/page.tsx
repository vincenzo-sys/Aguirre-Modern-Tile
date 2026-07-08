import { redirect } from 'next/navigation'

// "New Job" form moved to /dashboard/leads/board/new. This shim forwards old
// links along with their prefill query params (customer_id, from_lead, name,
// phone, email, type, notes).
export default async function NewJobRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === 'string') qs.set(k, v)
    else if (Array.isArray(v)) v.forEach((x) => qs.append(k, x))
  }
  const q = qs.toString()
  redirect(`/dashboard/leads/board/new${q ? `?${q}` : ''}`)
}
