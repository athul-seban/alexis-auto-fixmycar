import { NextResponse } from "next/server"
import { withGarage } from "@/lib/garage-auth"
import { requireFeature } from "@/lib/org/guards"
import { businessSchema, getBusiness, updateBusiness } from "@/lib/org/business-service"

// The business's own details. Business-wide, so only someone holding organisation.edit at ALL locations (an Owner by default).
export const GET = withGarage(
  "Garage business GET",
  async (_req, ctx) => {
    requireFeature(ctx, "staff")
    return NextResponse.json({ business: await getBusiness(ctx) })
  },
  { permission: "organisation.edit" }
)

export const PATCH = withGarage(
  "Garage business PATCH",
  async (req, ctx) => {
    requireFeature(ctx, "staff")
    const input = businessSchema.parse(await req.json().catch(() => null))
    return NextResponse.json({ business: await updateBusiness(ctx, input) })
  },
  { permission: "organisation.edit", write: true }
)
