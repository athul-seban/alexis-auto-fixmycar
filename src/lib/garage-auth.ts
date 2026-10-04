import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import type { Garage } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { handleRouteError } from "@/lib/portal/route-errors"

export interface GarageContext {
  userId: string
  garage: Garage
}

export type GarageAuthResult = { ok: true; ctx: GarageContext } | { ok: false; response: NextResponse }

const fail = (status: number, error: string, code?: string): GarageAuthResult => ({
  ok: false,
  response: NextResponse.json(code ? { error, code } : { error }, { status }),
})

/**
 * Authorises a garage-portal API call. The JWT's role/suspension can be stale (it is baked in
 * at login), so the database is re-checked on every call.
 *
 *  - no session                      -> 401
 *  - not a (non-suspended) GARAGE    -> 403
 *  - no Garage row                   -> 404 NO_GARAGE
 *  - write on a SUSPENDED garage     -> 403 GARAGE_SUSPENDED (reads and exports still work)
 */
export async function requireGarage(opts: { write?: boolean } = {}): Promise<GarageAuthResult> {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as { id?: string; role?: string } | undefined
  if (!sessionUser?.id) return fail(401, "Unauthorized")
  if (sessionUser.role !== "GARAGE") return fail(403, "Forbidden")

  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { id: true, role: true, suspendedAt: true },
  })
  if (!user || user.role !== "GARAGE" || user.suspendedAt) return fail(403, "Forbidden")

  const garage = await prisma.garage.findUnique({ where: { userId: user.id } })
  if (!garage) return fail(404, "Garage profile not found", "NO_GARAGE")

  if (opts.write && garage.status === "SUSPENDED") {
    return fail(403, "Your garage is suspended — the portal is read-only", "GARAGE_SUSPENDED")
  }
  return { ok: true, ctx: { userId: user.id, garage } }
}

type RouteContext<P> = { params: Promise<P> }

/**
 * Wraps a garage route handler with auth + error mapping. Works for both static routes and
 * dynamic ones (`[id]`), whose Next 16 `params` is a Promise.
 */
export function withGarage<P = Record<string, never>>(
  label: string,
  handler: (req: Request, ctx: GarageContext, params: P) => Promise<Response>,
  opts: { write?: boolean } = {}
) {
  return async (req: Request, routeCtx?: RouteContext<P>): Promise<Response> => {
    const auth = await requireGarage(opts)
    if (!auth.ok) return auth.response
    try {
      const params = routeCtx?.params ? await routeCtx.params : ({} as P)
      return await handler(req, auth.ctx, params)
    } catch (err) {
      return handleRouteError(err, label)
    }
  }
}
