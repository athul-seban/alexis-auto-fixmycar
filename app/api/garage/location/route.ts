import { NextResponse } from "next/server"
import { z } from "zod"
import { withGarage } from "@/lib/garage-auth"
import { ACTIVE_LOCATION_COOKIE, isLocationId } from "@/lib/org/active-location"
import { OrgError } from "@/lib/org/org-error"
import { accessToLocation } from "@/lib/org/resolve"

const schema = z.object({ locationId: z.string().refine(isLocationId, "Choose a location") })

/**
 * Switch the location the portal acts on. The choice is only remembered (a cookie), never trusted: it is checked here
 * against what the person may open, and again on every request. An archived location can be opened to look at its history.
 */
export const POST = withGarage(
  "Garage location POST",
  async (req, ctx) => {
    const { locationId } = schema.parse(await req.json().catch(() => null))
    const here = await accessToLocation(ctx.userId, locationId)
    if (!here) throw new OrgError("NOT_FOUND", "That location isn't available to you.")

    const res = NextResponse.json({ location: { id: here.garage.id, name: here.garage.name, city: here.garage.city, status: here.garage.status } })
    res.cookies.set(ACTIVE_LOCATION_COOKIE, here.garage.id, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", secure: process.env.NODE_ENV === "production" })
    return res
  },
  { permission: "member" }
)
