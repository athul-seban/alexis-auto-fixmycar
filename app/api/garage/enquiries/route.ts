import { NextResponse } from "next/server"
import { withGarage } from "@/lib/garage-auth"
import { enquiriesQuerySchema, listEnquiries } from "@/lib/portal/enquiries"

export const GET = withGarage("Garage enquiries GET", async (req, { garage }) => {
  const sp = new URL(req.url).searchParams
  const parsed = enquiriesQuerySchema.safeParse({
    stage: sp.get("stage") || undefined,
    kind: sp.get("kind") || undefined,
    q: sp.get("q") || undefined,
    page: sp.get("page") || undefined,
    pageSize: sp.get("pageSize") || undefined,
  })
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return NextResponse.json({ error: `Invalid ${issue.path.join(".") || "query"}: ${issue.message}` }, { status: 400 })
  }
  return NextResponse.json(await listEnquiries(garage, parsed.data))
})
