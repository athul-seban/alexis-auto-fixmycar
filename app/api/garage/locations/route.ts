import { NextResponse } from "next/server"
import { withGarage } from "@/lib/garage-auth"
import { requireFeature } from "@/lib/org/guards"
import { addLocation, listLocations, newLocationSchema } from "@/lib/org/locations-service"

// The business's locations. Business-wide, so only someone holding locations.manage at ALL locations (an Owner by default).
export const GET = withGarage(
  "Garage locations GET",
  async (_req, ctx) => {
    requireFeature(ctx, "locations")
    return NextResponse.json(await listLocations(ctx))
  },
  { permission: "locations.manage" }
)

/** Add a location. It waits for platform approval before it appears on the marketplace. */
export const POST = withGarage(
  "Garage locations POST",
  async (req, ctx) => {
    requireFeature(ctx, "locations")
    const input = newLocationSchema.parse(await req.json())
    const location = await addLocation(ctx, input)
    return NextResponse.json({ location: { id: location.id, name: location.name, slug: location.slug, city: location.city, status: location.status } }, { status: 201 })
  },
  { permission: "locations.manage", write: true }
)
