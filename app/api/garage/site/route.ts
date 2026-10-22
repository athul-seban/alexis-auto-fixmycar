import { NextResponse } from "next/server"
import { withGarage } from "@/lib/garage-auth"
import { requireFeature } from "@/lib/org/guards"
import { getEditorState, saveDraft, saveDraftSchema } from "@/lib/site/site-service"

// The business's website: business-wide, so website.edit held at ALL locations (an Owner by default).
export const GET = withGarage(
  "Garage site GET",
  async (_req, ctx) => {
    requireFeature(ctx, "sites")
    return NextResponse.json(await getEditorState(ctx))
  },
  { permission: "website.edit" }
)

/** Save edits to the draft (never the live site). The editor sends the version it loaded; a stale save is refused. */
export const PATCH = withGarage(
  "Garage site PATCH",
  async (req, ctx) => {
    requireFeature(ctx, "sites")
    const input = saveDraftSchema.parse(await req.json().catch(() => null))
    return NextResponse.json(await saveDraft(ctx, input))
  },
  { permission: "website.edit", write: true }
)
