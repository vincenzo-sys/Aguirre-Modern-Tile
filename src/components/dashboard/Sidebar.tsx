'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { LogOut, X } from 'lucide-react'
import type { Profile } from '@/lib/supabase/types'
import {
  ownerHome,
  ownerSections,
  installerHome,
  installerExtras,
  isNavActive,
  type NavItem,
} from '@/lib/dashboardNav'

export default function Sidebar({ profile }: { profile: Profile }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [mobileOpen, setMobileOpen] = useState(false)
  const isOwner = profile.role === 'owner'

  // Bottom tab bar's "More" tab triggers the drawer via window event so the
  // shared layout doesn't need to lift drawer state. Listener mounted once
  // per Sidebar render, cleaned on unmount.
  useEffect(() => {
    const open = () => setMobileOpen(true)
    window.addEventListener('dashboard:open-sidebar', open)
    return () => window.removeEventListener('dashboard:open-sidebar', open)
  }, [])

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  function renderItem(item: NavItem) {
    const active = isNavActive(item.href, pathname || '')
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setMobileOpen(false)}
        className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
          active ? 'bg-primary-600 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white'
        }`}
      >
        <item.icon className="w-5 h-5" />
        {item.label}
      </Link>
    )
  }

  const homeItem: NavItem = isOwner ? ownerHome : installerHome

  const navContent = (
    <>
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-lg font-bold text-white">Aguirre Modern Tile</h2>
        <p className="text-sm text-gray-400 mt-0.5">{profile.full_name}</p>
        <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full bg-primary-600 text-white capitalize">
          {profile.role}
        </span>
      </div>

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {renderItem(homeItem)}

        {isOwner ? (
          ownerSections.map((section) => (
            <div key={section.heading} className="pt-4 mt-2">
              <p className="px-3 mb-1 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                {section.heading}
              </p>
              <div className="space-y-1">{section.items.map(renderItem)}</div>
            </div>
          ))
        ) : (
          <div className="pt-2">{installerExtras.map(renderItem)}</div>
        )}
      </nav>

      <div className="p-4 border-t border-gray-700">
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm font-medium text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
        >
          <LogOut className="w-5 h-5" />
          Sign out
        </button>
      </div>
    </>
  )

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <div
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-gray-800 transform transition-transform lg:hidden ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-4 right-4 text-gray-400 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>
        <div className="flex flex-col h-full">{navContent}</div>
      </div>

      <div className="hidden lg:flex lg:flex-col lg:w-64 lg:bg-gray-800 lg:shrink-0">
        {navContent}
      </div>
    </>
  )
}
