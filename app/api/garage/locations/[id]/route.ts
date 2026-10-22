import { NextResponse } from "next/server"
import { withGarage } from "@/lib/garage-auth"
import { requireFeature } from "@/lib/org/guards"
import { locationActionSchema, setLocationArchived } from "@/lib/org/locations-service"

/** Close a location (archive) or bring it back (restore). Locations are never deleted: their history stays. */
export const PATCH = withGarage<{ id: string }>(
  "Garage location PATCH",
  async (req, ctx, params) => {
    requireFeature(ctx, "locations")
    const { action } = locationActionSchema.parse(await req.json())
    const location = await setLocationArchived(ctx, params.id, action)
    return NextResponse.json({ location: { id: location.id, name: location.name, status: location.status } })
  },
  // `write` is left off on purpose: closing the branch you are looking at (which turns read-only) must not lock you out of
  // restoring it, and the service refuses the changes that matter.
  { permission: "locations.manage" }
)
