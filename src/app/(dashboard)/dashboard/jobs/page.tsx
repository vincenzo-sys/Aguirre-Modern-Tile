import { redirect } from 'next/navigation'

// The Jobs board moved under the Leads hub as the "Installs" board:
// /dashboard/leads/board. This shim forwards old links (and their view/filter
// query params) so nothing 404s.
export default async function JobsBoardRedirect({
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
  redirect(`/dashboard/leads/board${q ? `?${q}` : ''}`)
}
