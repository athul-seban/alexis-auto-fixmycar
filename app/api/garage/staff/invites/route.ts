import { NextResponse } from "next/server"
import { withGarage } from "@/lib/garage-auth"
import { requireFeature } from "@/lib/org/guards"
import { inviteSchema, inviteStaff } from "@/lib/org/staff-service"
import { limitByKey } from "@/lib/rate-limit"

export const POST = withGarage(
  "Garage staff invite POST",
  async (req, ctx) => {
    requireFeature(ctx, "staff")
    // Each invitation sends an email to an arbitrary address, so it is limited per business.
    const limited = await limitByKey("staff-invite", ctx.organisation?.id ?? ctx.garage.id, 30, 60 * 60 * 1000)
    if (limited) return limited
    const body = inviteSchema.parse(await req.json().catch(() => null))
    return NextResponse.json(await inviteStaff(ctx, ctx.userId, body), { status: 201 })
  },
  { permission: "staff.manage", write: true }
)
