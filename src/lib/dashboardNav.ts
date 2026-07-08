// Single source of truth for dashboard navigation. Sidebar consumes the
// sectioned view; MobileTabBar consumes the `pinnedToTabBar` filter. This
// keeps href + icon + label drift impossible — adding a new top-level
// page means editing one file.

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
  ImageIcon,
  HardHat,
  type LucideIcon,
} from 'lucide-react'

export type NavItem = {
  label: string
  href: string
  icon: LucideIcon
  // When true, this item appears in the mobile bottom tab bar. Aim for
  // 4 of these per role so the tab bar has 5 cells with the "More" tab.
  pinnedToTabBar?: boolean
}

export type NavSection = {
  heading: string
  items: NavItem[]
}

// Owner: Sales / Operations / Estimation. The home item lives outside
// sections (rendered at the top of the sidebar) and is implicitly pinned
// to the tab bar.
export const ownerHome: NavItem = {
  label: 'Home',
  href: '/dashboard',
  icon: Home,
  pinnedToTabBar: true,
}

export const ownerSections: NavSection[] = [
  {
    heading: 'Sales',
    items: [
      { label: 'Leads', href: '/dashboard/leads', icon: Inbox, pinnedToTabBar: true },
      { label: 'Customers', href: '/dashboard/customers', icon: Users },
      { label: 'Gallery', href: '/dashboard/gallery', icon: ImageIcon },
      { label: 'Invoices', href: '/dashboard/invoices', icon: FileText },
      { label: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
    ],
  },
  {
    heading: 'Operations',
    items: [
      { label: 'Schedule', href: '/dashboard/schedule', icon: CalendarDays, pinnedToTabBar: true },
      { label: 'Installs', href: '/dashboard/leads/board', icon: ClipboardList, pinnedToTabBar: true },
      { label: 'Materials', href: '/dashboard/materials', icon: Package },
      { label: 'Crew', href: '/dashboard/settings/crew', icon: HardHat },
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

// Installer: minimal nav. Both items pinned (only 2 tabs + More).
export const installerHome: NavItem = {
  label: 'Today',
  href: '/dashboard',
  icon: Home,
  pinnedToTabBar: true,
}

export const installerExtras: NavItem[] = [
  // The crew's week view is the Installs board filtered to their assigned jobs
  // (the board applies the assigned_to filter for non-owners).
  { label: 'Week', href: '/dashboard/leads/board', icon: CalendarDays, pinnedToTabBar: true },
]

export type Role = 'owner' | 'crew'

// Tab-bar items for a role: the home item plus any pinned items from the
// sectioned nav, in their declared order. Sidebar order = tab bar order.
export function getTabBarItems(role: Role): NavItem[] {
  if (role !== 'owner') {
    return [installerHome, ...installerExtras.filter((i) => i.pinnedToTabBar)]
  }
  const pinned = ownerSections.flatMap((s) => s.items.filter((i) => i.pinnedToTabBar))
  return [ownerHome, ...pinned]
}

// Active-tab logic shared by sidebar and tab bar so a route never lights
// one nav element but not the other. Exact match for /dashboard, prefix for
// nested routes. The Installs board lives *under* the leads path
// (/dashboard/leads/board), so it needs an explicit branch — otherwise the
// board would light both Installs and Leads, and Leads would swallow it.
export function isNavActive(href: string, pathname: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard'
  if (href === '/dashboard/leads/board') return pathname.startsWith('/dashboard/leads/board')
  if (href === '/dashboard/leads') {
    return (
      pathname === '/dashboard/leads' ||
      (pathname.startsWith('/dashboard/leads/') && !pathname.startsWith('/dashboard/leads/board'))
    )
  }
  return pathname.startsWith(href)
}
