import { ALL_LOCATIONS, computeAccess, type AssignmentLike, type RoleLike } from "@/lib/org/access"
import { PERMISSION_KEYS, PERMISSIONS, permissionScope, permissionsFromJson, type PermissionKey } from "@/lib/org/permissions"
import { OWNER_ROLE_KEY } from "@/lib/org/presets"

// Who may define roles, hand them out, and change other people's access. Pure (no database), so the rules that stop
// privilege escalation can be tested exhaustively. Every function returns a human-readable PROBLEM, or null when allowed.
//
// The principle: you can never give away more than you have. A manager can't create a role stronger than themselves,
// can't hand someone a role they couldn't hold at that place, and can't touch someone who outranks them.

export interface ActorPower {
  /** Holds the Owner role at all locations. */
  isOwner: boolean
  /** Permissions held at ALL locations: the most that can be put in a business-wide role or assigned everywhere. */
  ceiling: ReadonlySet<PermissionKey>
  /** Permissions held at one particular location. */
  at(locationId: string): ReadonlySet<PermissionKey>
}

export function actorPower(assignments: readonly AssignmentLike[], roles: readonly RoleLike[]): ActorPower {
  const everywhere = computeAccess(assignments, roles, ALL_LOCATIONS)
  return { isOwner: everywhere.isOwner, ceiling: everywhere.permissions, at: (id) => computeAccess(assignments, roles, id).permissions }
}

/** A legacy single-login owner (no business yet) holds everything. */
export const legacyPower = (): ActorPower => ({ isOwner: true, ceiling: new Set(PERMISSION_KEYS), at: () => new Set(PERMISSION_KEYS) })

const label = (k: PermissionKey) => PERMISSIONS[k].label.toLowerCase()
const list = (keys: readonly PermissionKey[]) => keys.map(label).join(", ")

export const MAX_ROLES_PER_BUSINESS = 30
export const ROLE_NAME_MAX = 60

/** The role is the Owner role (the system one, not a custom role that happens to be called "owner"). */
export const isOwnerRole = (r: Pick<RoleLike, "presetKey" | "isSystem">) => r.isSystem && r.presetKey === OWNER_ROLE_KEY

/** May the actor create or change a role so that it holds exactly `permissions`? */
export function roleDefinitionProblem(power: ActorPower, permissions: readonly PermissionKey[]): string | null {
  if (!power.ceiling.has("roles.manage")) return "You don't have permission to manage roles."
  const beyond = permissions.filter((k) => !power.ceiling.has(k))
  if (beyond.length > 0) return `You can't give a role permissions you don't have yourself: ${list(beyond)}.`
  return null
}

/**
 * May the actor give `role` to someone at `scopeKey` (a location id, or "*" for everywhere)?
 * Pass `removing: true` for taking a role away: a switched-off role may still be removed.
 */
export function assignmentProblem(power: ActorPower, role: Pick<RoleLike, "presetKey" | "isSystem" | "isEnabled" | "permissions">, scopeKey: string, opts: { removing?: boolean } = {}): string | null {
  if (!opts.removing && !role.isEnabled) return "That role is switched off. Switch it on first."

  if (isOwnerRole(role)) {
    if (!power.isOwner) return "Only an Owner can make someone an Owner or change an Owner."
    if (scopeKey !== ALL_LOCATIONS) return "An Owner owns the whole business, not one location."
    return null
  }

  const everywhere = scopeKey === ALL_LOCATIONS
  const held = everywhere ? power.ceiling : power.at(scopeKey)
  if (!held.has("staff.manage")) return everywhere ? "You can only manage people at all locations if you hold that role at all locations." : "You don't have permission to manage staff at that location."

  // A role held at one location only carries its location permissions (business-wide ones are inert there), so only
  // those count against the ceiling.
  const needed = permissionsFromJson(role.permissions).filter((k) => everywhere || permissionScope(k) === "location")
  const beyond = needed.filter((k) => !held.has(k))
  if (beyond.length > 0) return `You can't give a role that includes permissions you don't hold${everywhere ? "" : " at that location"}: ${list(beyond)}.`
  return null
}

/** Nobody changes their own access: it is how a person would promote themselves, or lock themselves out by accident. */
export function selfChangeProblem(actorUserId: string, targetUserId: string): string | null {
  return actorUserId === targetUserId ? "You can't change your own access. Ask another owner or manager." : null
}

/** Names are shown to people choosing a role, so keep them tidy and unique within the business. */
export function roleNameProblem(name: string, existing: readonly { id: string; name: string }[], selfId?: string): string | null {
  const n = name.trim()
  if (n.length < 2) return "Give the role a name of at least 2 characters."
  if (n.length > ROLE_NAME_MAX) return `Role names can be at most ${ROLE_NAME_MAX} characters.`
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f<>]/.test(n)) return "That name contains characters that aren't allowed."
  if (existing.some((r) => r.id !== selfId && r.name.trim().toLowerCase() === n.toLowerCase())) return "A role with that name already exists."
  return null
}
