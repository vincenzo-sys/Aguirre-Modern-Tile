import { redirect } from 'next/navigation'

// Moved under the unified deal detail: /dashboard/leads/[id]/estimate.
// Kept as a redirect for any old bookmarks / links.
export default async function EstimateRedirect({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  redirect(`/dashboard/leads/${id}/estimate`)
}
