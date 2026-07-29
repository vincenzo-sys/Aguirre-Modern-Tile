import type { SupabaseClient } from '@supabase/supabase-js'

// Phone matching shared by every route that links an incoming phone number to
// a customer record (web intake, manual lead entry, OpenPhone webhook).
// Numbers arrive in wildly different formats — "(617) 555-1234" from a form,
// "+16175551234" from OpenPhone, "6175551234" hand-typed — so string equality
// on the stored value misses real matches and forks duplicate customers.
// The canonical identity is the LAST 10 DIGITS.

// Last 10 digits of a phone number, or null when there aren't enough digits
// to identify a US line.
export function last10(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  return digits.length >= 10 ? digits.slice(-10) : null
}

// PostgREST .or() filter that narrows candidates in SQL before the
// authoritative JS check in pickPhoneMatch. Strips PostgREST-reserved chars
// so a formatted "(617) 555-1234" can't 400 the .or() and silently defeat
// dedup (→ duplicate customer).
export function buildPhoneOrFilter(raw: string): string | null {
  const key = last10(raw)
  if (!key) return null
  const safePhone = raw.replace(/[,().]/g, '')
  return `phone.eq.${safePhone},phone.like.%${key}`
}

// Authoritative digits comparison over the candidate rows returned by the
// SQL pre-filter. `phone.like.%<last10>` can false-positive (any stored
// string ending in those digits), so this JS compare decides.
export function pickPhoneMatch<T extends { phone?: string | null }>(
  rows: T[] | null | undefined,
  raw: string
): T | null {
  const key = last10(raw)
  if (!key || !rows) return null
  return rows.find((row) => last10(row.phone) === key) ?? null
}

// Find-by-phone against `customers`, composing the three helpers above.
// `select` must include `phone` — pickPhoneMatch needs it for the final
// digits comparison.
export async function findCustomerByPhone<
  T extends { phone?: string | null } = { id: string; phone: string | null },
>(
  supabase: SupabaseClient,
  raw: string,
  select = 'id, phone'
): Promise<T | null> {
  const filter = buildPhoneOrFilter(raw)
  if (!filter) return null
  const { data } = await supabase.from('customers').select(select).or(filter).limit(5)
  return pickPhoneMatch<T>((data as T[] | null) ?? null, raw)
}
