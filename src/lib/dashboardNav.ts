// Single source of truth for dashboard navigation. Sidebar consumes the
// sectioned view; MobileTabBar consumes the `pinnedToTabBar` filter. This
// keeps href + icon + label drift impossible — adding a new top-level
// page means editing one file.

import {
  Home,
  Inbox,
  Target,
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

// Owner: a stripped-down primary nav (Home / Leads / Schedule) with
// everything else tucked into `ownerSections` behind a collapsible "More"
// in the sidebar. The home item lives outside both (rendered at the top,
// implicitly pinned to the tab bar).
export const ownerHome: NavItem = {
  label: 'Home',
  href: '/dashboard',
  icon: Home,
  pinnedToTabBar: true,
}

// Always-visible primary items. All pinned, so the tab bar = Home / Inbox
// / Leads / Schedule / More. Inbox is first: it's the "what came in"
// surface; Leads is the "work the deals" surface.
export const ownerPrimary: NavItem[] = [
  { label: 'Inbox', href: '/dashboard/inbox', icon: Inbox, pinnedToTabBar: true },
  { label: 'Leads', href: '/dashboard/leads', icon: Target, pinnedToTabBar: true },
  { label: 'Schedule', href: '/dashboard/schedule', icon: CalendarDays, pinnedToTabBar: true },
]

// Everything else — rendered under the sidebar's collapsible "More". Still
// grouped Sales / Operations / Estimation for organization; none pinned to
// the tab bar (they live behind the "More" tab).
export const ownerSections: NavSection[] = [
  {
    heading: 'Sales',
    items: [
      { label: 'Customers', href: '/dashboard/customers', icon: Users },
      { label: 'Gallery', href: '/dashboard/gallery', icon: ImageIcon },
      { label: 'Invoices', href: '/dashboard/invoices', icon: FileText },
      { label: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
    ],
  },
  {
    heading: 'Operations',
    items: [
      { label: 'Installs', href: '/dashboard/leads/board', icon: ClipboardList },
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
  // Pinned items come from the primary nav; still scan `ownerSections` so a
  // future `pinnedToTabBar` on a "More" item would surface here too.
  const pinned = [...ownerPrimary, ...ownerSections.flatMap((s) => s.items)]
    .filter((i) => i.pinnedToTabBar)
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
