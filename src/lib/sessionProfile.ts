import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

// Returns the calling user's profile id from the session cookie, or null when
// the request is from an API-key client (which has no session). Used to
// attribute writes (created_by / logged_by) the same way the final-payment
// route does — kept here so the crew & labor routes share one implementation.
export async function getSessionProfileId(): Promise<string | null> {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll() { /* no-op */ },
        },
      }
    )
    const { data: { user } } = await supabase.auth.getUser()
    return user?.id ?? null
  } catch {
    return null
  }
}
