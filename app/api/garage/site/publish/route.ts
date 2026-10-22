import { NextResponse } from "next/server"
import { z } from "zod"
import { withGarage } from "@/lib/garage-auth"
import { requireFeature } from "@/lib/org/guards"
import { requestPublish, rollback, unpublish, withdrawSubmission } from "@/lib/site/site-service"

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("publish") }), // first time: sends it for review; afterwards: goes live
  z.object({ action: z.literal("unpublish") }),
  z.object({ action: z.literal("withdraw") }), // take back a submission that is waiting for review
  z.object({ action: z.literal("rollback"), revisionId: z.string().min(1).max(64) }),
])

export const POST = withGarage(
  "Garage site publish POST",
  async (req, ctx) => {
    requireFeature(ctx, "sites")
    const body = bodySchema.parse(await req.json().catch(() => null))
    switch (body.action) {
      case "publish":
        return NextResponse.json(await requestPublish(ctx))
      case "unpublish":
        await unpublish(ctx)
        return NextResponse.json({ status: "UNPUBLISHED" })
      case "withdraw":
        await withdrawSubmission(ctx)
        return NextResponse.json({ status: "DRAFT" })
      case "rollback":
        await rollback(ctx, body.revisionId)
        return NextResponse.json({ status: "PUBLISHED" })
    }
  },
  { permission: "website.edit", write: true }
)
