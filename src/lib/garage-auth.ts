import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import type { Garage, Organisation } from "@prisma/client"
import { authOptions } from "@/lib/auth"
import { handleRouteError } from "@/lib/portal/route-errors"
import { can as hasPermission, canAny, type Access } from "@/lib/org/access"
import { requestedLocationId } from "@/lib/org/active-location"
import type { PermissionKey } from "@/lib/org/permissions"
import { garageFailureResponse, resolveGarageAccess, type LocationSummary } from "@/lib/org/resolve"

/**
 * What a garage-portal route requires of the caller, at the active location:
 *  - a permission key           must hold it
 *  - { anyOf: [...] }           must hold at least one
 *  - "member"                   any active member of the business (own account, dashboard, "who am I")
 * It is REQUIRED on every withGarage call (the type forces it, and src/lib/org/architecture.test.ts checks), so a new
 * route can't be added by accident with no permission decision.
 */
export type GaragePermission = PermissionKey | { anyOf: readonly PermissionKey[] } | "member"

export interface GarageRouteOptions {
  /** A write: refused with 403 GARAGE_SUSPENDED while the location is suspended (reads and exports still work). */
  write?: boolean
  permission: GaragePermission
}

export interface GarageContext {
  userId: string
  /** The location this request is about. */
  garage: Garage
  /** The business; null only for a legacy garage that hasn't been backfilled yet. */
  organisation: Organisation | null
  membershipId: string | null
  access: Access
  /** Every location the caller can open. */
  locations: LocationSummary[]
  legacy: boolean
  can: (key: PermissionKey) => boolean
}

export type GarageAuthResult = { ok: true; ctx: GarageContext } | { ok: false; response: NextResponse }

const fail = (status: number, error: string, code?: string): GarageAuthResult => ({
  ok: false,
  response: NextResponse.json(code ? { error, code } : { error }, { status }),
})

/** The 403 for "signed in and a member, but not allowed to do this". For checks that depend on the request body or query. */
export const forbidden = () => NextResponse.json({ error: "You don't have permission to do that", code: "FORBIDDEN" }, { status: 403 })

function allowed(access: Access, permission: GaragePermission): boolean {
  if (permission === "member") return true // reaching here means they are a member with access to the active location
  if (typeof permission === "string") return hasPermission(access, permission)
  return canAny(access, permission.anyOf)
}

/**
 * Authorises a garage-portal API call. The JWT's role/suspension can be stale (it is baked in at login), so the
 * database is re-checked on every call.
 *
 *  - no session                          -> 401
 *  - not a (non-suspended) GARAGE login  -> 403
 *  - no garage / no access to one        -> 404 NO_GARAGE / 403 NO_ACCESS
 *  - missing the required permission     -> 403 FORBIDDEN
 *  - write on a SUSPENDED location       -> 403 GARAGE_SUSPENDED (reads and exports still work)
 *
 * `req` lets the caller's chosen location (x-qmg-location header) take effect; without it the cookie or default is used.
 */
export async function requireGarage(opts: { write?: boolean; permission?: GaragePermission } = {}, req?: Request): Promise<GarageAuthResult> {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as { id?: string; role?: string } | undefined
  if (!sessionUser?.id) return fail(401, "Unauthorized")
  if (sessionUser.role !== "GARAGE") return fail(403, "Forbidden")

  const resolved = await resolveGarageAccess(sessionUser.id, await requestedLocationId(req))
  if (!resolved.ok) return { ok: false, response: garageFailureResponse(resolved.failure) }
  const { garage, access } = resolved.value

  if (opts.permission && !allowed(access, opts.permission)) {
    return { ok: false, response: forbidden() }
  }
  if (opts.write && garage.status === "SUSPENDED") {
    return fail(403, "Your garage is suspended — the portal is read-only", "GARAGE_SUSPENDED")
  }

  const v = resolved.value
  return { ok: true, ctx: { ...v, can: (key) => hasPermission(v.access, key) } }
}

type RouteContext<P> = { params: Promise<P> }

/**
 * Wraps a garage route handler with auth + permission + error mapping. Works for both static routes and dynamic ones
 * (`[id]`), whose Next 16 `params` is a Promise. `opts.permission` is required.
 */
export function withGarage<P = Record<string, never>>(
  label: string,
  handler: (req: Request, ctx: GarageContext, params: P) => Promise<Response>,
  opts: GarageRouteOptions
) {
  return async (req: Request, routeCtx?: RouteContext<P>): Promise<Response> => {
    const auth = await requireGarage(opts, req)
    if (!auth.ok) return auth.response
    try {
      const params = routeCtx?.params ? await routeCtx.params : ({} as P)
      return await handler(req, auth.ctx, params)
    } catch (err) {
      return handleRouteError(err, label)
    }
  }
}
