import crypto from "crypto"

// Staff invitation tokens. The emailed link carries the token; only its SHA-256 is stored, so a leaked database can't be
// used to accept invitations. Tokens are single use and expire.

export const INVITE_VALID_DAYS = 7

export const newInviteToken = (): string => crypto.randomBytes(32).toString("base64url")

export const hashInviteToken = (token: string): string => crypto.createHash("sha256").update(token).digest("hex")

/** What an invitation grants: roles, each at some locations (null = all locations, including future ones). */
export interface InviteAssignment {
  roleId: string
  garageIds: string[] | null
}

/** Reads StaffInvite.assignments (a JSON string) defensively: bad data gives an empty list, never an error. */
export function parseInviteAssignments(json: string | null | undefined): InviteAssignment[] {
  try {
    const parsed: unknown = JSON.parse(json ?? "[]")
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((a): InviteAssignment[] => {
      if (!a || typeof a !== "object" || typeof (a as { roleId?: unknown }).roleId !== "string") return []
      const ids = (a as { garageIds?: unknown }).garageIds
      if (ids === null || ids === undefined) return [{ roleId: (a as { roleId: string }).roleId, garageIds: null }]
      if (!Array.isArray(ids) || !ids.every((i) => typeof i === "string")) return []
      return [{ roleId: (a as { roleId: string }).roleId, garageIds: ids as string[] }]
    })
  } catch {
    return []
  }
}
