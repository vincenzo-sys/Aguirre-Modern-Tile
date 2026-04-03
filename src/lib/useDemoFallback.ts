// Server-side helper: checks if we should use demo data
// Returns true if Supabase isn't configured OR if the user isn't authenticated
export async function shouldUseDemoData(): Promise<boolean> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return true

  try {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return !user
  } catch {
    return true
  }
}
