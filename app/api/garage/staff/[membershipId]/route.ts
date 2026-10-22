import { NextResponse } from "next/server"
import { withGarage } from "@/lib/garage-auth"
import { requireFeature } from "@/lib/org/guards"
import { removeMember, setMemberStatus, statusSchema } from "@/lib/org/staff-service"

type Params = { membershipId: string }

/** Suspend or reinstate a team member (they keep their roles but can't use the portal while suspended). */
export const PATCH = withGarage<Params>(
  "Garage staff PATCH",
  async (req, ctx, { membershipId }) => {
    requireFeature(ctx, "staff")
    const { status } = statusSchema.parse(await req.json().catch(() => null))
    await setMemberStatus(ctx, ctx.userId, membershipId, status)
    return NextResponse.json({ success: true })
  },
  { permission: "staff.manage", write: true }
)

/** Remove a person from the team. */
export const DELETE = withGarage<Params>(
  "Garage staff DELETE",
  async (_req, ctx, { membershipId }) => {
    requireFeature(ctx, "staff")
    await removeMember(ctx, ctx.userId, membershipId)
    return NextResponse.json({ success: true })
  },
  { permission: "staff.manage", write: true }
)
