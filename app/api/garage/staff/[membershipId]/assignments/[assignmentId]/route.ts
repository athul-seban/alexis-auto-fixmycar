import { NextResponse } from "next/server"
import { withGarage } from "@/lib/garage-auth"
import { requireFeature } from "@/lib/org/guards"
import { removeAssignment } from "@/lib/org/staff-service"

type Params = { membershipId: string; assignmentId: string }

/** Take one role away from a team member. */
export const DELETE = withGarage<Params>(
  "Garage staff assignment DELETE",
  async (_req, ctx, { membershipId, assignmentId }) => {
    requireFeature(ctx, "staff")
    await removeAssignment(ctx, ctx.userId, membershipId, assignmentId)
    return NextResponse.json({ success: true })
  },
  { permission: "staff.manage", write: true }
)
