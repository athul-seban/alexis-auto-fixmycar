// Role checks shared by the proxy, layouts and every /api/admin/* handler.
// SUPER_ADMIN is a strict superset of ADMIN: it can do everything an admin can, plus the things only it may do
// (platform settings, creating garages, granting or removing admin roles).

export const ROLES = ["OWNER", "GARAGE", "ADMIN", "SUPER_ADMIN"] as const
export type Role = (typeof ROLES)[number]

/** Admin portal access: ADMIN or SUPER_ADMIN. */
export const isAdmin = (role?: string | null): boolean => role === "ADMIN" || role === "SUPER_ADMIN"

export const isSuperAdmin = (role?: string | null): boolean => role === "SUPER_ADMIN"
