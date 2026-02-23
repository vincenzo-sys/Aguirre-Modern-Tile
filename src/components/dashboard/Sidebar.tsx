'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ClipboardList, BarChart3, MapPin, FileText, LogOut, Menu, X } from 'lucide-react'
import type { Profile } from '@/lib/supabase/types'

const allNavItems = [
  { label: 'Jobs', href: '/dashboard', icon: ClipboardList, ownerOnly: false },
  { label: 'Analytics', href: '/dashboard/analytics', icon: BarChart3, ownerOnly: false },
  { label: 'Team Map', href: '/dashboard/team-map', icon: MapPin, ownerOnly: false },
  { label: 'Invoices', href: '/dashboard/invoices', icon: FileText, ownerOnly: true },
]

export default function Sidebar({ profile }: { profile: Profile }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [mobileOpen, setMobileOpen] = useState(false)

  const navItems = allNavItems.filter(
    (item) => !item.ownerOnly || profile.role === 'owner'
  )

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  function isActive(href: string) {
    if (href === '/dashboard') {
      return pathname === '/dashboard' || pathname.startsWith('/dashboard/jobs')
    }
    return pathname.startsWith(href)
  }

  const navContent = (
    <>
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-lg font-bold text-white">Aguirre Modern Tile</h2>
        <p className="text-sm text-gray-400 mt-0.5">{profile.full_name}</p>
        <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full bg-primary-600 text-white capitalize">
          {profile.role}
        </span>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const active = isActive(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                active
                  ? 'bg-primary-600 text-white'
                  : 'text-gray-300 hover:bg-gray-700 hover:text-white'
              }`}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </Link>
          )
        })}
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
      {/* Mobile menu button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-md bg-gray-800 text-white shadow-lg"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
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

      {/* Desktop sidebar */}
      <div className="hidden lg:flex lg:flex-col lg:w-64 lg:bg-gray-800 lg:shrink-0">
        {navContent}
      </div>
    </>
  )
}
