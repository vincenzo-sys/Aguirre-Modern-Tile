'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home,
  Inbox,
  ClipboardList,
  CalendarDays,
  Menu,
  type LucideIcon,
} from 'lucide-react'
import type { Profile } from '@/lib/supabase/types'

// Native-app-style bottom tab bar for the dashboard. Visible on mobile only;
// desktop keeps the sidebar. The "More" tab triggers the existing sidebar
// drawer (whose floating Menu button still lives in Sidebar.tsx but is
// hidden on mobile when this bar is mounted) so power-user flows like
// Customers / Invoices / Analytics / Team Map remain reachable in 2 taps.
//
// Tab choice differs by role per the existing sidebar grouping:
//   - Owner: Home / Leads / Jobs / Schedule / More
//   - Installer: Today / Week / More
//
// Why a CustomEvent instead of lifting state: the drawer state lives in
// Sidebar.tsx, which doesn't know about this component. A window event is
// the cheapest decoupled-trigger pattern that doesn't require restructuring
// the dashboard layout. Sidebar listens via a useEffect mount.

interface Tab {
  label: string
  href: string
  icon: LucideIcon
}

const ownerTabs: Tab[] = [
  { label: 'Home', href: '/dashboard', icon: Home },
  { label: 'Leads', href: '/dashboard/leads', icon: Inbox },
  { label: 'Jobs', href: '/dashboard/jobs', icon: ClipboardList },
  { label: 'Schedule', href: '/dashboard/schedule', icon: CalendarDays },
]

const installerTabs: Tab[] = [
  { label: 'Today', href: '/dashboard', icon: Home },
  { label: 'Week', href: '/dashboard/jobs', icon: CalendarDays },
]

// Match the same active-tab logic the sidebar uses — exact match for the
// dashboard root, prefix match for nested routes (so /dashboard/jobs/abc
// keeps the Jobs tab lit). Without this, drilling into a job detail
// page would un-highlight Jobs.
function isTabActive(href: string, pathname: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard'
  return pathname.startsWith(href)
}

export default function MobileTabBar({ profile }: { profile: Profile }) {
  const pathname = usePathname() || ''
  const tabs = profile.role === 'owner' ? ownerTabs : installerTabs

  function openSidebar() {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('dashboard:open-sidebar'))
    }
  }

  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-gray-200 shadow-[0_-2px_8px_rgba(0,0,0,0.06)] pb-[env(safe-area-inset-bottom)]"
      aria-label="Primary"
    >
      <div className="flex items-stretch justify-around">
        {tabs.map((tab) => {
          const active = isTabActive(tab.href, pathname)
          const Icon = tab.icon
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex-1 flex flex-col items-center justify-center gap-1 py-2.5 min-h-[64px] active:scale-95 transition-transform ${
                active ? 'text-primary-600' : 'text-gray-500'
              }`}
            >
              <Icon className={`w-7 h-7 ${active ? 'text-primary-600' : 'text-gray-500'}`} />
              <span className={`text-xs font-medium ${active ? 'text-primary-700' : 'text-gray-600'}`}>
                {tab.label}
              </span>
            </Link>
          )
        })}
        <button
          type="button"
          onClick={openSidebar}
          className="flex-1 flex flex-col items-center justify-center gap-1 py-2.5 min-h-[64px] active:scale-95 transition-transform text-gray-500"
          aria-label="Open more options"
        >
          <Menu className="w-7 h-7 text-gray-500" />
          <span className="text-xs font-medium text-gray-600">More</span>
        </button>
      </div>
    </nav>
  )
}
