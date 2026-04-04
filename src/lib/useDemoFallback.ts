// Server-side helper: checks if we should use demo data
// Returns true if Supabase isn't configured, if SUPABASE_SERVICE_ROLE_KEY is missing
// (meaning we can't query the DB), or if the user isn't authenticated
export async function shouldUseDemoData(): Promise<boolean> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return true
  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return true

  try {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return !user
  } catch {
    return true
  }
}
