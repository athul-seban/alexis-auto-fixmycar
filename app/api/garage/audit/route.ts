import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withGarage } from "@/lib/garage-auth"
import { auditLabel } from "@/lib/org/audit-labels"
import { OrgError } from "@/lib/org/org-error"
import { requireFeature } from "@/lib/org/guards"

const PAGE_SIZE = 25

// The business's own activity trail: who invited whom, who changed which role, which location was added or closed.
// Only entries filed under this business; the platform's own admin actions are not shown here.
export const GET = withGarage(
  "Garage audit GET",
  async (req, ctx) => {
    requireFeature(ctx, "staff")
    if (!ctx.organisation) throw new OrgError("CONFLICT", "This garage hasn't been set up as a business yet.")
    const page = Math.max(1, Math.min(1000, Number(new URL(req.url).searchParams.get("page")) || 1))
    const where = { organisationId: ctx.organisation.id }
    const [total, rows] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    ])
    return NextResponse.json({
      entries: rows.map((r) => ({ id: r.id, at: r.createdAt.toISOString(), action: r.action, label: auditLabel(r.action), by: r.actorEmail, detail: r.detail })),
      total,
      page,
      pageSize: PAGE_SIZE,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    })
  },
  { permission: "audit.view" }
)
