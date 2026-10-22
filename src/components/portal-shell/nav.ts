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
  PencilLine,
  LifeBuoy,
  KeyRound,
  Building2,
  Briefcase,
  History,
  LockKeyhole,
  Monitor,
  UserCog,
  type LucideIcon,
} from "lucide-react"
import type { PermissionKey } from "@/lib/org/permissions"
import type { OrgFeature } from "@/lib/org/features"

/** What a person must hold to see a page: one permission, or any of several. */
export type NavRequirement = PermissionKey | { anyOf: readonly PermissionKey[] }

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  /** Key into the `badges` map the layout passes to the shell (unread / needs-attention counts). */
  badge?: string
  /** Second key of a `g` then <key> navigation shortcut. */
  shortcut?: string
  /** Garage portal: hidden (and the page redirected away from) unless the person holds this at the active location. Hiding is a courtesy; every API route checks again. */
  permission?: NavRequirement
  /** Garage portal: hidden while this feature is switched off for the business (see src/lib/org/features.ts). */
  feature?: OrgFeature
  /** Garage portal: shown under this name once the feature is on (the existing "Website" page becomes "Online booking" when a real website builder arrives). */
  labelWhenFeature?: { feature: OrgFeature; label: string }
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
  /** What the settings page (the gear icon) needs. */
  settingsPermission?: NavRequirement
  /** Permissions for pages that aren't sidebar items (matched by path prefix). */
  extraPermissions?: Record<string, NavRequirement>
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
  settingsPermission: "settings.edit",
  accountHref: `${G}/account`,
  extraTitles: { [`${G}/insights`]: "Insights", [`${G}/settings`]: "Settings", [`${G}/account`]: "Account" },
  extraPermissions: { [`${G}/insights`]: "insights.view", [`${G}/settings`]: "settings.edit" },
  sections: [
    {
      items: [
        { href: G, label: "Dashboard", icon: LayoutDashboard, shortcut: "h" },
        { href: `${G}/diary`, label: "Diary", icon: CalendarDays, shortcut: "d", permission: { anyOf: ["diary.view", "diary.viewOwn"] } },
        { href: `${G}/bookings`, label: "Bookings", icon: ClipboardCheck, badge: "needsOutcome", shortcut: "b", permission: { anyOf: ["bookings.view", "bookings.viewOwn"] } },
        { href: `${G}/customers`, label: "Customers", icon: Contact, shortcut: "u", permission: "customers.view" },
        { href: `${G}/messages`, label: "Messages", icon: MessageSquare, badge: "unreadMessages", shortcut: "i", permission: "messages.view" },
        { href: `${G}/reviews`, label: "Reviews", icon: Star, badge: "unrepliedReviews", shortcut: "r", permission: "reviews.view" },
      ],
    },
    {
      label: "Listing & Website",
      items: [
        { href: `${G}/profile`, label: "Profile", icon: Store, shortcut: "p", permission: "profile.edit" },
        { href: `${G}/website`, label: "Website", labelWhenFeature: { feature: "sites", label: "Online booking" }, icon: Globe, shortcut: "w", permission: "settings.edit" },
        { href: `${G}/site`, label: "Website", icon: Monitor, shortcut: "s", permission: "website.edit", feature: "sites" },
        { href: `${G}/pricing`, label: "Pricing", icon: PoundSterling, shortcut: "c", permission: { anyOf: ["pricing.view", "pricing.edit"] } },
        { href: `${G}/enquiries`, label: "Enquiries", icon: Inbox, badge: "newEnquiries", shortcut: "e", permission: "enquiries.view" },
        { href: `${G}/billing`, label: "Plan & billing", icon: CreditCard, shortcut: "m", permission: "billing.view" },
      ],
    },
    {
      label: "Business",
      items: [
        { href: `${G}/team`, label: "Team", icon: UserCog, shortcut: "t", permission: "staff.manage", feature: "staff" },
        { href: `${G}/roles`, label: "Roles", icon: LockKeyhole, shortcut: "o", permission: { anyOf: ["roles.manage", "staff.manage"] }, feature: "staff" },
        { href: `${G}/locations`, label: "Locations", icon: Building2, shortcut: "l", permission: "locations.manage", feature: "locations" },
        { href: `${G}/business`, label: "Business details", icon: Briefcase, shortcut: "y", permission: "organisation.edit", feature: "staff" },
        { href: `${G}/activity`, label: "Activity", icon: History, shortcut: "a", permission: "audit.view", feature: "staff" },
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
        { href: `${A}/sites`, label: "Websites", icon: Monitor, badge: "pendingSites" },
        { href: `${A}/users`, label: "Users", icon: Users },
        { href: `${A}/reviews`, label: "Reviews", icon: Star, badge: "openDisputes" },
        { href: `${A}/documents`, label: "Documents", icon: FileCheck2, badge: "pendingDocuments" },
        { href: `${A}/articles`, label: "Guides & blog", icon: BookOpen },
        { href: `${A}/content`, label: "Site content", icon: PencilLine },
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

// Super admins get the whole admin sidebar plus the platform-only pages. Hiding the link isn't the protection: the
// page and /api/admin/settings each check the role themselves.
export const SUPER_ADMIN_NAV: PortalNav = {
  ...ADMIN_NAV,
  ariaLabel: "Super admin portal",
  sections: [...ADMIN_NAV.sections, { label: "Platform", items: [{ href: `${A}/settings`, label: "Platform settings", icon: KeyRound }] }],
}

const O = "/dashboard"

export type PortalId = "garage" | "admin" | "superAdmin" | "owner"
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

export const PORTAL_NAVS: Record<PortalId, PortalNav> = { garage: GARAGE_NAV, admin: ADMIN_NAV, superAdmin: SUPER_ADMIN_NAV, owner: OWNER_NAV }
