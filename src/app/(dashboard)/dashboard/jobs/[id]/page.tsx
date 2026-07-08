import { redirect } from 'next/navigation'

// The standalone Jobs section was removed. The deal detail now lives at
// /dashboard/leads/[id] — a unified sales + operations workspace. This shim
// preserves old links: internal navigation that hasn't been repointed yet, and
// (more importantly) external emails already sent with a /dashboard/jobs/<id>
// URL — Stripe receipts, estimate threads, crew-approval requests.
export default async function JobDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  redirect(`/dashboard/leads/${id}`)
}
