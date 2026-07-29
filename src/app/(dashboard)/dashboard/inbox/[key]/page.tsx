import ThreadView from '@/components/inbox/ThreadView'

// Thread detail as a real route (not a slide-over) so the phone's back
// button works and threads are linkable. The key is the thread key from
// /api/inbox — a phone's last-10 digits.
export default async function InboxThreadPage({
  params,
}: {
  params: Promise<{ key: string }>
}) {
  const { key } = await params
  return <ThreadView threadKey={key} />
}
