import { PERMISSION_KEYS, permissionScope, permissionsFromJson, type PermissionKey } from "@/lib/org/permissions"
import { OWNER_ROLE_KEY } from "@/lib/org/presets"

// Pure access rules: given what a member has been assigned, what may they do at a location? No database here, so the
// rules are easy to test exhaustively. src/lib/org/resolve.ts loads the rows and calls these.

/** scopeKey on a RoleAssignment meaning "every location, including ones added later". */
export const ALL_LOCATIONS = "*"

export interface AssignmentLike {
  roleId: string
  /** The garage id, or ALL_LOCATIONS. */
  scopeKey: string
}

export interface RoleLike {
  id: string
  presetKey: string | null
  isSystem: boolean
  isEnabled: boolean
  /** Role.permissions: a JSON string of permission keys. */
  permissions: string
}

export interface Access {
  /** Holds the Owner role. */
  isOwner: boolean
  /** Locations the member can open: every location, or an explicit list. */
  locations: "all" | readonly string[]
  /** What they may do at the location asked about. Organisation-wide keys appear only from an all-locations assignment. */
  permissions: ReadonlySet<PermissionKey>
}

const isOwnerRole = (r: RoleLike) => r.isSystem && r.presetKey === OWNER_ROLE_KEY

/** The locations a member can open, from their assignments alone. */
export function accessibleLocations(assignments: readonly AssignmentLike[]): "all" | string[] {
  if (assignments.some((a) => a.scopeKey === ALL_LOCATIONS)) return "all"
  return [...new Set(assignments.map((a) => a.scopeKey))]
}

/** Can this member open `locationId` at all? */
export function canAccessLocation(assignments: readonly AssignmentLike[], locationId: string): boolean {
  return assignments.some((a) => a.scopeKey === ALL_LOCATIONS || a.scopeKey === locationId)
}

/**
 * What a member may do at `locationId`.
 *  - Only assignments that cover the location count (all locations, or that one).
 *  - Disabled roles grant nothing.
 *  - The Owner role always grants everything; held at one location only it grants that location's keys, not the business's.
 *  - Organisation-wide keys count only when the role is held at ALL locations.
 */
export function computeAccess(assignments: readonly AssignmentLike[], roles: readonly RoleLike[], locationId: string): Access {
  const byId = new Map(roles.map((r) => [r.id, r]))
  const granted = new Set<PermissionKey>()
  let isOwner = false

  for (const a of assignments) {
    const everywhere = a.scopeKey === ALL_LOCATIONS
    if (!everywhere && a.scopeKey !== locationId) continue
    const role = byId.get(a.roleId)
    if (!role || !role.isEnabled) continue

    const keys: readonly PermissionKey[] = isOwnerRole(role) ? PERMISSION_KEYS : permissionsFromJson(role.permissions)
    if (isOwnerRole(role) && everywhere) isOwner = true
    for (const k of keys) {
      if (permissionScope(k) === "organisation" && !everywhere) continue
      granted.add(k)
    }
  }

  return { isOwner, locations: accessibleLocations(assignments), permissions: granted }
}

export const can = (access: Pick<Access, "permissions">, key: PermissionKey): boolean => access.permissions.has(key)
export const canAll = (access: Pick<Access, "permissions">, keys: readonly PermissionKey[]): boolean => keys.every((k) => access.permissions.has(k))
export const canAny = (access: Pick<Access, "permissions">, keys: readonly PermissionKey[]): boolean => keys.some((k) => access.permissions.has(k))

/** Permission strings safe to send to the browser (for hiding navigation). */
export const permissionList = (access: Pick<Access, "permissions">): PermissionKey[] => PERMISSION_KEYS.filter((k) => access.permissions.has(k))

/** The keys a legacy single-login owner effectively has: everything, at their one location. */
export const LEGACY_OWNER_PERMISSIONS: ReadonlySet<PermissionKey> = new Set(PERMISSION_KEYS)
