'use client'

import { useEffect, useState, useCallback } from 'react'

// useLocalStorageState: useState + automatic hydrate/persist to
// localStorage. Drop-in replacement for useState when you want the
// value to survive reloads — no `useEffect` boilerplate at call sites.
//
// SSR-safe: returns the initial value during server rendering and
// hydrates from localStorage in a useEffect once mounted. Components
// see a one-frame flash of the default if their stored value diverges,
// which is fine for view preferences (the alternative is layout
// shift on every visit).
//
// The optional `isValid` guard rejects unknown stored values (e.g.,
// after a key rename or enum prune). Returning false hands back the
// default and silently overwrites the bad value on next persist.
//
// Usage:
//   const [view, setView] = useLocalStorageState<'cards' | 'kanban'>(
//     'leads_view_mode_v1', 'cards',
//     (v): v is 'cards' | 'kanban' => v === 'cards' || v === 'kanban',
//   )

export function useLocalStorageState<T>(
  key: string,
  defaultValue: T,
  isValid?: (raw: unknown) => raw is T,
): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(defaultValue)

  // Hydrate once on mount. Failures (private mode, corrupted JSON,
  // failed validation) silently fall back to the default — never
  // throw a render error over a preference.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw === null) return
      const parsed: unknown = JSON.parse(raw)
      if (isValid && !isValid(parsed)) return
      setValue(parsed as T)
    } catch {
      /* swallow */
    }
    // We intentionally hydrate only on mount; subsequent key changes
    // would require a remount anyway (different scope).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persist on every change. The try/catch covers quota errors and
  // disabled storage (Safari private mode, some embedded contexts).
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)) }
    catch { /* swallow */ }
  }, [key, value])

  // Memoize the setter so consumers can put it in deps lists safely.
  const set = useCallback((next: T | ((prev: T) => T)) => {
    setValue((prev) => (typeof next === 'function' ? (next as (p: T) => T)(prev) : next))
  }, [])

  return [value, set]
}
