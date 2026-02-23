import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    // Return a dummy object in demo mode to prevent SSR prerender crashes.
    // Actual Supabase calls are gated behind isDemoMode checks.
    return null as any
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey)
}
