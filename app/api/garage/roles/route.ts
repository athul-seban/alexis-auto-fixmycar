import { NextResponse } from "next/server"
import { withGarage } from "@/lib/garage-auth"
import { requireFeature } from "@/lib/org/guards"
import { createRole, createRoleSchema, listRoles } from "@/lib/org/roles-service"

// The business's roles: what can be assigned (staff.manage needs the list), and the library of presets to switch on.
export const GET = withGarage(
  "Garage roles GET",
  async (_req, ctx) => {
    requireFeature(ctx, "staff")
    return NextResponse.json(await listRoles(ctx))
  },
  { permission: { anyOf: ["roles.manage", "staff.manage"] } }
)

// Switch on a preset, copy a role, or make a custom one.
export const POST = withGarage(
  "Garage roles POST",
  async (req, ctx) => {
    requireFeature(ctx, "staff")
    const body = createRoleSchema.parse(await req.json().catch(() => null))
    return NextResponse.json({ role: await createRole(ctx, body) }, { status: 201 })
  },
  { permission: "roles.manage", write: true }
)
