// Server-side helper: checks if we should use demo data
// Returns true if Supabase isn't configured, if SUPABASE_SERVICE_ROLE_KEY is missing
// (meaning we can't query the DB), or if the user isn't authenticated
export async function shouldUseDemoData(): Promise<boolean> {
  // Force demo mode — always show demo data until auth is fully configured
  // Remove this line once Supabase auth + profiles table are set up
  return true
}
