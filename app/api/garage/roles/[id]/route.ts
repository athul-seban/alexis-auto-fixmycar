import { NextResponse } from "next/server"
import { withGarage } from "@/lib/garage-auth"
import { requireFeature } from "@/lib/org/guards"
import { deleteRole, updateRole, updateRoleSchema } from "@/lib/org/roles-service"

type Params = { id: string }

export const PATCH = withGarage<Params>(
  "Garage role PATCH",
  async (req, ctx, { id }) => {
    requireFeature(ctx, "staff")
    const body = updateRoleSchema.parse(await req.json().catch(() => null))
    return NextResponse.json({ role: await updateRole(ctx, id, body) })
  },
  { permission: "roles.manage", write: true }
)

export const DELETE = withGarage<Params>(
  "Garage role DELETE",
  async (_req, ctx, { id }) => {
    requireFeature(ctx, "staff")
    await deleteRole(ctx, id)
    return NextResponse.json({ success: true })
  },
  { permission: "roles.manage", write: true }
)
