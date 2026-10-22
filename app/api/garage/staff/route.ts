import { NextResponse } from "next/server"
import { withGarage } from "@/lib/garage-auth"
import { requireFeature } from "@/lib/org/guards"
import { listStaff } from "@/lib/org/staff-service"

// The team: people you can manage (plus yourself) and their pending invitations.
export const GET = withGarage(
  "Garage staff GET",
  async (_req, ctx) => {
    requireFeature(ctx, "staff")
    return NextResponse.json(await listStaff(ctx, ctx.userId))
  },
  { permission: "staff.manage" }
)
