// Which location the portal is acting on. It is never stored in the JWT (a role change or a new location must show up
// at once), and it is never trusted: whatever arrives here is only a REQUEST, checked against the user's assignments by
// resolveGarageAccess. A bad or foreign id simply falls back to the default location.

/** Sent by the portal's fetch helpers on every /api/garage call, so two browser tabs on different locations can't cross wires. */
export const ACTIVE_LOCATION_HEADER = "x-qmg-location"

/** Remembered between page loads (set by POST /api/garage/location). Not secret, not httpOnly. */
export const ACTIVE_LOCATION_COOKIE = "qmg_loc"

/** Garage ids are cuids; this only rejects obvious junk before it reaches a query. */
export const isLocationId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(v)

/** The location the caller asked for: the request header first, then the cookie. Null when neither is usable. */
export async function requestedLocationId(req?: Request): Promise<string | null> {
  const header = req?.headers.get(ACTIVE_LOCATION_HEADER)
  if (isLocationId(header)) return header
  try {
    // next/headers throws outside a request (unit tests, scripts), which just means "no cookie".
    const { cookies } = await import("next/headers")
    const value = (await cookies()).get(ACTIVE_LOCATION_COOKIE)?.value
    return isLocationId(value) ? value : null
  } catch {
    return null
  }
}
