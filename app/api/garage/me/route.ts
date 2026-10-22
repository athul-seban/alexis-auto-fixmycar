import { NextResponse } from "next/server"
import { withGarage } from "@/lib/garage-auth"
import { permissionList } from "@/lib/org/access"
import { toGarageProfile, parseServiceList } from "@/lib/garage-mapper"

/**
 * The location the portal is acting on, plus what the signed-in person may do there: the business, the locations they can
 * switch between and their permission keys. The browser uses the keys only to hide things they can't use; every route
 * re-checks them on the server.
 */
export const GET = withGarage(
  "Garage me GET",
  async (_req, { garage, organisation, access, locations }) => {
    const profile = toGarageProfile(garage as never)
    const verificationBadges = parseServiceList(garage.verificationBadges)

    return NextResponse.json({
      garage: { ...profile, verificationBadges },
      organisation: organisation ? { id: organisation.id, name: organisation.name } : null,
      locations,
      permissions: permissionList(access),
      isOwner: access.isOwner,
    })
  },
  { permission: "member" }
)
