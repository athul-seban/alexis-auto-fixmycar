import { NextResponse } from "next/server"
import { withGarage } from "@/lib/garage-auth"
import { requireFeature } from "@/lib/org/guards"
import { resendInvite, revokeInvite } from "@/lib/org/staff-service"
import { limitByKey } from "@/lib/rate-limit"

type Params = { id: string }

/** Cancel a pending invitation: its link stops working. */
export const DELETE = withGarage<Params>(
  "Garage staff invite DELETE",
  async (_req, ctx, { id }) => {
    requireFeature(ctx, "staff")
    await revokeInvite(ctx, id)
    return NextResponse.json({ success: true })
  },
  { permission: "staff.manage", write: true }
)

/** Send a pending invitation again with a fresh link. */
export const POST = withGarage<Params>(
  "Garage staff invite resend",
  async (_req, ctx, { id }) => {
    requireFeature(ctx, "staff")
    const limited = await limitByKey("staff-invite", ctx.organisation?.id ?? ctx.garage.id, 30, 60 * 60 * 1000)
    if (limited) return limited
    return NextResponse.json(await resendInvite(ctx, ctx.userId, id))
  },
  { permission: "staff.manage", write: true }
)
