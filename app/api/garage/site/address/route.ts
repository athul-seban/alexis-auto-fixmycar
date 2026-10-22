import { NextResponse } from "next/server"
import { z } from "zod"
import { withGarage } from "@/lib/garage-auth"
import { requireFeature } from "@/lib/org/guards"
import { limitByKey } from "@/lib/rate-limit"
import { checkAddress, setAddress } from "@/lib/site/site-service"

/** Is this address free for this business? Powers the hint beside the field as they type. */
export const GET = withGarage(
  "Garage site address check",
  async (req, ctx) => {
    requireFeature(ctx, "sites")
    const label = new URL(req.url).searchParams.get("label") ?? ""
    // A cheap lookup, but it reveals which names are taken, so it is limited per business.
    const limited = await limitByKey("site-address-check", ctx.organisation?.id ?? ctx.userId, 120, 60 * 60 * 1000)
    if (limited) return limited
    return NextResponse.json(await checkAddress(ctx, label.slice(0, 80)))
  },
  { permission: "website.edit" }
)

const bodySchema = z.object({ label: z.string().trim().min(1).max(80) })

/** Choose or change the address. The old one keeps redirecting to the new. */
export const PUT = withGarage(
  "Garage site address PUT",
  async (req, ctx) => {
    requireFeature(ctx, "sites")
    const { label } = bodySchema.parse(await req.json().catch(() => null))
    const limited = await limitByKey("site-address-change", ctx.organisation?.id ?? ctx.userId, 10, 24 * 60 * 60 * 1000)
    if (limited) return limited
    return NextResponse.json(await setAddress(ctx, label))
  },
  { permission: "website.edit", write: true }
)
