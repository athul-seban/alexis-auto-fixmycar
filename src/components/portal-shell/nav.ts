import {
  BarChart3,
  BookOpen,
  Car,
  CalendarDays,
  ClipboardCheck,
  CreditCard,
  FileCheck2,
  FileText,
  Globe,
  Contact,
  Inbox,
  LayoutDashboard,
  MessageSquare,
  PoundSterling,
  Star,
  Store,
  Users,
  Wrench,
  ShieldCheck,
  ScrollText,
  LifeBuoy,
  type LucideIcon,
} from "lucide-react"

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  /** Key into the `badges` map the layout passes to the shell (unread / needs-attention counts). */
  badge?: string
  /** Second key of a `g` then <key> navigation shortcut. */
  shortcut?: string
}

export interface NavSection {
  label?: string
  items: NavItem[]
}

export interface PortalNav {
  /** Accessible name of the <nav> landmark. */
  ariaLabel: string
  /** The portal's home route; matched exactly so it isn't "active" on every child page. */
  base: string
  sections: NavSection[]
  /** Pages reachable from elsewhere (gear icon, in-page links) that aren't in the sidebar. */
  extraTitles: Record<string, string>
  settingsHref?: string
  /** The signed-in user's own account page (profile, password), linked from the user menu. */
  accountHref: string
  defaultTitle: string
}

export function isNavActive(pathname: string, href: string, base: string): boolean {
  return href === base ? pathname === base : pathname === href || pathname.startsWith(`${href}/`)
}

export function pageTitle(pathname: string, nav: PortalNav): string {
  const flat = nav.sections.flatMap((s) => s.items)
  const match = flat.find((i) => i.href !== nav.base && isNavActive(pathname, i.href, nav.base))
  if (match) return match.label
  const extra = Object.entries(nav.extraTitles).find(([href]) => isNavActive(pathname, href, nav.base))
  if (extra) return extra[1]
  return nav.defaultTitle
}

const G = "/garage-dashboard"

export const GARAGE_NAV: PortalNav = {
  ariaLabel: "Garage portal",
  base: G,
  defaultTitle: "Dashboard",
  settingsHref: `${G}/settings`,
  accountHref: `${G}/account`,
  extraTitles: { [`${G}/insights`]: "Insights", [`${G}/settings`]: "Settings", [`${G}/account`]: "Account" },
  sections: [
    {
      items: [
        { href: G, label: "Dashboard", icon: LayoutDashboard, shortcut: "h" },
        { href: `${G}/diary`, label: "Diary", icon: CalendarDays, shortcut: "d" },
        { href: `${G}/bookings`, label: "Bookings", icon: ClipboardCheck, badge: "needsOutcome", shortcut: "b" },
        { href: `${G}/customers`, label: "Customers", icon: Contact, shortcut: "u" },
        { href: `${G}/messages`, label: "Messages", icon: MessageSquare, badge: "unreadMessages", shortcut: "i" },
        { href: `${G}/reviews`, label: "Reviews", icon: Star, badge: "unrepliedReviews", shortcut: "r" },
      ],
    },
    {
      label: "Listing & Website",
      items: [
        { href: `${G}/profile`, label: "Profile", icon: Store, shortcut: "p" },
        { href: `${G}/website`, label: "Website", icon: Globe, shortcut: "w" },
        { href: `${G}/pricing`, label: "Pricing", icon: PoundSterling, shortcut: "c" },
        { href: `${G}/enquiries`, label: "Enquiries", icon: Inbox, badge: "newEnquiries", shortcut: "e" },
        { href: `${G}/billing`, label: "Plan & billing", icon: CreditCard, shortcut: "m" },
      ],
    },
  ],
}

const A = "/admin"

export const ADMIN_NAV: PortalNav = {
  ariaLabel: "Admin portal",
  base: A,
  defaultTitle: "Overview",
  settingsHref: `${A}/account`,
  accountHref: `${A}/account`,
  extraTitles: { [`${A}/account`]: "Account" },
  sections: [
    { items: [{ href: A, label: "Overview", icon: LayoutDashboard }] },
    {
      label: "Marketplace",
      items: [
        { href: `${A}/garages`, label: "Garages", icon: Wrench, badge: "pendingGarages" },
        { href: `${A}/users`, label: "Users", icon: Users },
        { href: `${A}/reviews`, label: "Reviews", icon: Star, badge: "openDisputes" },
        { href: `${A}/documents`, label: "Documents", icon: FileCheck2, badge: "pendingDocuments" },
        { href: `${A}/articles`, label: "Guides & blog", icon: BookOpen },
      ],
    },
    {
      label: "Activity",
      items: [
        { href: `${A}/bookings`, label: "Bookings", icon: ClipboardCheck },
        { href: `${A}/quotes`, label: "Quotes", icon: FileText },
        { href: `${A}/enquiries`, label: "Enquiries", icon: Inbox },
        { href: `${A}/messages`, label: "Messages", icon: MessageSquare },
        { href: `${A}/vehicles`, label: "Vehicles", icon: Car },
      ],
    },
    {
      label: "Insights",
      items: [
        { href: `${A}/widgets`, label: "Widgets", icon: ShieldCheck },
        { href: `${A}/analytics`, label: "Analytics", icon: BarChart3 },
        { href: `${A}/support`, label: "Support lookup", icon: LifeBuoy },
        { href: `${A}/audit`, label: "Audit log", icon: ScrollText },
      ],
    },
  ],
}

const O = "/dashboard"

export type PortalId = "garage" | "admin" | "owner"
// Layouts are server components and can't pass a nav object (it holds icon functions) to the client
// shell, so they pass an id and the shell looks it up here.

export const OWNER_NAV: PortalNav = {
  ariaLabel: "My account",
  base: O,
  defaultTitle: "Overview",
  settingsHref: `${O}/settings`,
  accountHref: `${O}/settings`,
  extraTitles: { [`${O}/settings`]: "Account" },
  sections: [
    {
      items: [
        { href: O, label: "Overview", icon: LayoutDashboard },
        { href: `${O}/bookings`, label: "Bookings", icon: ClipboardCheck },
        { href: `${O}/quotes`, label: "Quotes", icon: FileText, badge: "quotesToReview" },
        { href: `${O}/vehicles`, label: "My vehicles", icon: Car, badge: "vehiclesDue" },
        { href: `${O}/messages`, label: "Messages", icon: MessageSquare, badge: "unreadMessages" },
        { href: `${O}/reviews`, label: "Reviews", icon: Star },
      ],
    },
  ],
}

export const PORTAL_NAVS: Record<PortalId, PortalNav> = { garage: GARAGE_NAV, admin: ADMIN_NAV, owner: OWNER_NAV }
