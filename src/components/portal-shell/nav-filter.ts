import type { PermissionKey } from "@/lib/org/permissions"
import { isNavActive, type NavItem, type NavRequirement, type PortalNav } from "@/components/portal-shell/nav"

// What the signed-in person can open, applied to the portal navigation. This only decides what to SHOW: hiding a link
// protects nothing, and every API route checks the permission again on the server.

export interface PortalAccess {
  /** Permission keys at the active location (what `permissionList(access)` returns on the server). */
  permissions: readonly string[]
  /** Which business features are switched on for this business. */
  features: { staff: boolean; locations: boolean; sites: boolean }
  isOwner: boolean
}

/** May someone holding `permissions` meet this requirement? No requirement means anyone. */
export function meets(permissions: readonly string[], requirement: NavRequirement | undefined): boolean {
  if (!requirement) return true
  if (typeof requirement === "string") return permissions.includes(requirement)
  return requirement.anyOf.some((k: PermissionKey) => permissions.includes(k))
}

const itemAllowed = (item: NavItem, access: PortalAccess): boolean => (!item.feature || access.features[item.feature]) && meets(access.permissions, item.permission)

/** An item as this business sees it: some items change their name once a feature is on. */
const named = (item: NavItem, access: PortalAccess): NavItem => (item.labelWhenFeature && access.features[item.labelWhenFeature.feature] ? { ...item, label: item.labelWhenFeature.label } : item)

/** The nav with the items this person can't use removed, then any section left empty. Unchanged without access info. */
export function filterNav(nav: PortalNav, access: PortalAccess | undefined): PortalNav {
  if (!access) return nav
  const sections = nav.sections.map((s) => ({ ...s, items: s.items.filter((i) => itemAllowed(i, access)).map((i) => named(i, access)) })).filter((s) => s.items.length > 0)
  const settingsHref = nav.settingsHref && meets(access.permissions, nav.settingsPermission) ? nav.settingsHref : undefined
  return { ...nav, sections, settingsHref }
}

/**
 * Is this page open to the person? Matches the most specific sidebar item or extra page for the path; a page the nav
 * knows nothing about (or the home page) is allowed, so only pages with a stated requirement can be refused.
 */
export function isPageAllowed(pathname: string, nav: PortalNav, access: PortalAccess | undefined): boolean {
  if (!access) return true
  const candidates: { href: string; allowed: boolean }[] = [
    ...nav.sections.flatMap((s) => s.items).filter((i) => i.href !== nav.base).map((i) => ({ href: i.href, allowed: itemAllowed(i, access) })),
    ...Object.entries(nav.extraPermissions ?? {}).map(([href, req]) => ({ href, allowed: meets(access.permissions, req) })),
  ]
  const match = candidates.filter((c) => isNavActive(pathname, c.href, nav.base)).sort((a, b) => b.href.length - a.href.length)[0]
  return match ? match.allowed : true
}
