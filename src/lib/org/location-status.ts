// What state a location (a Garage row) is in, and what that allows.
//
//   PENDING    new, waiting for platform approval (the portal works; it isn't on the marketplace yet)
//   APPROVED   live
//   SUSPENDED  switched off by the platform: read-only
//   ARCHIVED   closed by the business itself (a branch that shut): read-only, off the marketplace, history kept
//
// Writes are allowed only while PENDING or APPROVED, so any status added later is read-only until someone decides
// otherwise (it fails closed). Everything public already requires APPROVED exactly.

export const LOCATION_STATUSES = ["PENDING", "APPROVED", "SUSPENDED", "ARCHIVED"] as const
export type LocationStatus = (typeof LOCATION_STATUSES)[number]

export interface ReadOnlyReason {
  code: "GARAGE_SUSPENDED" | "LOCATION_ARCHIVED" | "LOCATION_READ_ONLY"
  message: string
}

/** Why the portal is read-only for this location, or null when it can be written to. */
export function readOnlyReason(status: string): ReadOnlyReason | null {
  if (status === "PENDING" || status === "APPROVED") return null
  if (status === "SUSPENDED") return { code: "GARAGE_SUSPENDED", message: "Your garage is suspended — the portal is read-only" }
  if (status === "ARCHIVED") return { code: "LOCATION_ARCHIVED", message: "This location is archived — it is read-only. Restore it to make changes." }
  return { code: "LOCATION_READ_ONLY", message: "This location is read-only." }
}

export const isReadOnlyLocation = (status: string): boolean => readOnlyReason(status) !== null
