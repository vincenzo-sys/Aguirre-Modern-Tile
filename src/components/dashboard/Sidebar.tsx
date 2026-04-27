'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Home,
  Inbox,
  ClipboardList,
  CalendarDays,
  Package,
  Users,
  FileText,
  BarChart3,
  MapPin,
  Settings,
  LogOut,
  Menu,
  X,
  ImageIcon,
} from 'lucide-react'
import type { Profile } from '@/lib/supabase/types'

type NavItem = {
  label: string
  href: string
  icon: typeof Home
}

type NavSection = {
  heading: string
  items: NavItem[]
}

const ownerSections: NavSection[] = [
  {
    heading: 'Sales',
    items: [
      { label: 'Leads', href: '/dashboard/leads', icon: Inbox },
      { label: 'Customers', href: '/dashboard/customers', icon: Users },
      { label: 'Gallery', href: '/dashboard/gallery', icon: ImageIcon },
      { label: 'Invoices', href: '/dashboard/invoices', icon: FileText },
      { label: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
    ],
  },
  {
    heading: 'Operations',
    items: [
      { label: 'Schedule', href: '/dashboard/schedule', icon: CalendarDays },
      { label: 'Jobs', href: '/dashboard/jobs', icon: ClipboardList },
      { label: 'Materials', href: '/dashboard/materials', icon: Package },
      { label: 'Team Map', href: '/dashboard/team-map', icon: MapPin },
    ],
  },
  {
    heading: 'Estimation',
    items: [
      { label: 'Templates', href: '/dashboard/templates', icon: FileText },
      { label: 'Estimating Guidance', href: '/dashboard/settings', icon: Settings },
    ],
  },
]

const installerPrimary: NavItem[] = [
  { label: 'Today', href: '/dashboard', icon: Home },
  { label: 'Week', href: '/dashboard/jobs', icon: CalendarDays },
]

export default function Sidebar({ profile }: { profile: Profile }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [mobileOpen, setMobileOpen] = useState(false)
  const isOwner = profile.role === 'owner'

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  function isActive(href: string) {
    if (href === '/dashboard') return pathname === '/dashboard'
    if (href === '/dashboard/jobs') return pathname.startsWith('/dashboard/jobs')
    return pathname.startsWith(href)
  }

  function renderItem(item: NavItem) {
    const active = isActive(item.href)
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

  const homeItem: NavItem = isOwner
    ? { label: 'Home', href: '/dashboard', icon: Home }
    : installerPrimary[0]

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
          <div className="pt-2">{installerPrimary.slice(1).map(renderItem)}</div>
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
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-md bg-gray-800 text-white shadow-lg"
      >
        <Menu className="w-5 h-5" />
      </button>

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
