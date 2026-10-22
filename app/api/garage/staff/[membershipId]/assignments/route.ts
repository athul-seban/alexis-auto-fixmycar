import { NextResponse } from "next/server"
import { withGarage } from "@/lib/garage-auth"
import { requireFeature } from "@/lib/org/guards"
import { addAssignments, addAssignmentsSchema } from "@/lib/org/staff-service"

type Params = { membershipId: string }

/** Give a team member another role, at some locations or at all of them. */
export const POST = withGarage<Params>(
  "Garage staff assignments POST",
  async (req, ctx, { membershipId }) => {
    requireFeature(ctx, "staff")
    const { assignments } = addAssignmentsSchema.parse(await req.json().catch(() => null))
    await addAssignments(ctx, ctx.userId, membershipId, assignments)
    return NextResponse.json({ success: true }, { status: 201 })
  },
  { permission: "staff.manage", write: true }
)
